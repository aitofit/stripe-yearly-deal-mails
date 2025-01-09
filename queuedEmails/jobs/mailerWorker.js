const { MongoClient } = require('mongodb')
const nodemailer = require('nodemailer')
const nodemailerSendgrid = require('nodemailer-sendgrid')
const {
  getTemplateIdByLanguage,
  getSenderData,
  GENERAL_GROUP_ID,
  unsubGroupIds,
} = require('../../mailer/mailer')
const { getIdsEmailWasSent } = require('../helpers/mailerWorkerHelpers')
const { createEncodedUrl } = require('../../createDealLink')
// const Sentry = require('@sentry/node')
// const { captureException  } = require('@sentry/node')

const yearlyDealTemplateKey = 'yearlyDeal'

const options = { useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 5000 }
const client = new MongoClient(process.env.DB_URI, options)

const transporter = nodemailer.createTransport(
  nodemailerSendgrid({
    apiKey: process.env.SENDGRID_API_KEY,
  })
)

// Sentry.init({
//   dsn: 'https://1e4ffda7b9dfd241dfa0c31aac6c8056@o4506660263493632.ingest.sentry.io/4506756201512960',
//   debug: false,
//   environment: process.env.ENV,
//   normalizeDepth: 5,
// })

/**
 * Sends an email.
 *
 * @param {string} email - Recipients email
 * @param {string} firstName - Recipients first name
 * @param {string} templateId - Id of email template in the mailing service
 * @param {ObjectId} emailId - Document id of the queued email
 *
 * @returns A Promise, which resolves on successful send and rejects on error.
 * Contains response/error and id of email document
 */
const sendEmailPromisified = ({ email, firstName, stripeLink, templateId, emailId }) => {
  return new Promise((resolve, reject) => {
    transporter.sendMail(
      {
        from: getSenderData(),
        to: email,
        subject: 'Nappaa vuoden treenit tarjous!', // Subject is overridden by template
        dynamic_template_data: { firstName, stripeLink },
        templateId,
        asm: {
          group_id: GENERAL_GROUP_ID,
          unsubscribe_group_ids: unsubGroupIds,
        },
      },
      (err, info) => {
        if (err) {
          reject({ err, emailId })
        } else {
          resolve({ info, emailId })
        }
      }
    )
  })
}

/**
 * Tries to send all given emails. Won't resolve before all email sends are resolved or rejected.
 *
 * @param {Array} emailQueue - email data ready for sending
 *
 * @returns a Promise which resolves when all email send Promises are settled (resolved or rejected).
 * Contains response/error and email id for all emails that we tried to send.
 *
 * Example email:
 * {
 *   email: "to@mail.com",
 *   firstName: "Pertti",
 *   language: "fi",
 *   templateKey: "welcome",
 *   timeToSend: new Date(1703767458452)
 * }
 */
const sendQueuedEmails = (emailQueue) => {
  return new Promise((resolve, reject) => {
    try {
      const emailPromises = []

      for (const next of emailQueue) {
        const templateId = getTemplateIdByLanguage(yearlyDealTemplateKey, next.language)
        if (!templateId) {
          throw new Error(
            `Couldn't find template id for sending '${yearlyDealTemplateKey}' email in language '${next.language}`
          )
          continue
        }

        const stripeLink = createEncodedUrl(process.env.CHECKOUT_BASE_URL, next.email)

        emailPromises.push(
          sendEmailPromisified({
            email: next.email,
            firstName: next.name,
            stripeLink,
            templateId,
            emailId: next._id,
          })
        )
      }

      Promise.allSettled(emailPromises).then((results) => resolve(results))
    } catch (error) {
      console.log(error)
      reject(error)
    }
  })
}

/**
 * Deletes emails from queue with given ObjectIds.
 *
 * @param {Array} ids - MongoDB document ids (ObjectId) to remove
 *
 */
async function removeFromEmailQueue(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return

  await client
    .db()
    .collection('YearDealTargetUsers')
    .deleteMany({ _id: { $in: ids } })
}

/**
 * Gets emails from queue which have timeToSend passed.
 *
 * @returns An array of emails ready for sending
 */
async function getQueuedEmails() {
  const query = {
    timeToSend: {
      $lt: new Date(),
    },
  }

  return await client
    .db()
    .collection('YearDealTargetUsers')
    .find(query)
    // arbitrary limit to throttle send email API endpoint
    // TODO: implement throttling without hard limit before using queue for sending email to masses
    .limit(150)
    .toArray()
}

async function run() {
  let queueLen = 0
  let sentMails = 0
  try {
    await client.connect()

    const emailQueue = await getQueuedEmails()
    if (emailQueue.length === 0) {
      console.log('No emails in queue to send.')
      queueLen = 0
      sentMails = 0
    } else {
      console.log(`Sending ${emailQueue.length} emails... (limited to 150 at a time)`)
      const results = await sendQueuedEmails(emailQueue)
      const idsEmailWasSent = getIdsEmailWasSent(results)

      // map the email fields of the documents with the given ids
      const emailsSent = emailQueue.filter((doc) => idsEmailWasSent.includes(doc._id))

      // Save all ids and emails of sent emails to the database
      await client
        .db()
        .collection('SentYearDealEmails')
        .insertMany(emailsSent.map((sentMail) => ({ _id: sentMail._id, email: sentMail.email })))

      console.log('Emails sent:', idsEmailWasSent.length)
      console.log('Emails not sent:', emailQueue.length - idsEmailWasSent.length)
      console.log("Sent email's ids saved to the database")

      if (emailQueue.length > idsEmailWasSent.length) {
        throw new Error('All emails were not sent.')
      }

      await removeFromEmailQueue(idsEmailWasSent)

      queueLen = emailQueue.length
      sentMails = idsEmailWasSent.length
    }
  } catch (error) {
    throw error
  } finally {
    await client.close()
  }

  return { queueLen, sentMails }
}

const runEmailQueue = async () => {
  // By default disabled in dev env to not load mailing service
  if (process.env.NODE_ENV === 'production') {
    const queueLen = await run()
    return queueLen
  }
}

module.exports = { runEmailQueue }
