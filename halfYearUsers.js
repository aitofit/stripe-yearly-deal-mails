// const dotenv = require('dotenv')
// dotenv.config({ path: '.env.production' })

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ''
// const SIX_MONTH_PRICE = process.env.SIX_MONTH_PRICE || 'price_1QsQjGHuqNLiyMGxDzPqjRWU'  // test mode id
const YEARLY_PRICE = process.env.YEARLY_PRICE || 'price_1OfJGXHuqNLiyMGxmxEzfDA2' // in test mode this is: 'price_1Mc6PiHuqNLiyMGxdctmpvXw'

const MAILS_PER_DAY = 50
const MAILS_PER_HOUR = 10
const send_from = 'valmennus@aitofit.io'

const stripe = require('stripe')(STRIPE_SECRET_KEY)
const cliProgress = require('cli-progress')

const MongoClient = require('mongodb').MongoClient

const getYearlySubscriptionCustomers = async (verbose = false) => {
  const subscriptions = []
  const customers = []

  const progressBar = verbose
    ? new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    : {}
  const totalSubscriptions = 700 // Approximation of the total number of subscriptions

  verbose &&
    console.log(
      '\nQuerying Stripe for user emails with yearly subscription (there should be approximately 630 - 700)...'
    )
  verbose && progressBar.start(totalSubscriptions, 0)

  let count = 0
  for await (const subscription of stripe.subscriptions.list({
    price: YEARLY_PRICE,
  })) {
    subscriptions.push(subscription)
    const customer = await stripe.customers.retrieve(subscription.customer)
    customers.push(customer)
    count++
    verbose && progressBar.update(count)
  }

  verbose && progressBar.stop()
  return customers
}

// const production = true
const writeToLocalDBOnly = false // Do not do any writing operations to prod db if true

const localUri = 'mongodb://0.0.0.0:27017?directConnection=true'

const client = new MongoClient(process.env.DB_URI, {
  connectTimeoutMS: 60000,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 60000,
  socketTimeoutMS: 60000,
})
const localClient = new MongoClient(localUri, { connectTimeoutMS: 30000 })

const getHalfYearSubscriptionCustomers = async () => {
  let i = 0
  try {
    const yearlycustomers = await getYearlySubscriptionCustomers(true)
    const yearlyEmails = yearlycustomers.map((customer) => customer.email)

    console.log(`Number of existing yearly subscription customers is ${yearlyEmails.length}`)

    const database = client.db(process.env.DB_NAME)
    // if writeToLocalDBOnly is false, this actually points to the production database
    const localDB = writeToLocalDBOnly ? localClient.db('Main') : database
    const TARGET_COLLECTION = localDB.collection('YearDealTargetUsers')

    const SentEmailscollection = writeToLocalDBOnly
      ? localDB.collection('SentYearDealEmails')
      : database.collection('SentYearDealEmails')

    // const SentEmailscollection = database.collection('SentYearDealEmails')

    // Fetch all documents in the queue that have the sixMonths field set to true
    const queueDocuments = await TARGET_COLLECTION.find({ sixMonths: true }).toArray()

    const latestDate =
      queueDocuments.length > 0
        ? new Date(Math.max(...queueDocuments.map((e) => new Date(e.timeToSend).getTime())))
        : new Date()

    console.log(`Latest timeToSend in the target collection of SIX MONTH DEALS is ${latestDate}`)

    // Next, count how many queued emails have the date latestDate
    const count = queueDocuments.filter(
      (e) => e.timeToSend.getTime() === latestDate.getTime()
    ).length

    console.log(`There are ${count} emails with the latest timeToSend (SIX MONTH DEALS)`)

    // Extract emails into a simple array
    const queueEmailList = queueDocuments.map((doc) => doc.email)

    console.log(`Email queue of SIX MONTH DEALS already contains ${queueEmailList.length} emails`)

    // Fetch all documents from the sent emails collection and filter out half year emails
    const documents = (await SentEmailscollection.find({}).toArray()).filter(
      (doc) => !doc.sixMonths
    )

    // Extract sent SIX MONTH emails into a simple array
    const sentEmails = documents.map((doc) => doc.email).filter((doc) => doc.sixMonths)

    console.log(`Sent emails already contains ${sentEmails.length} emails\n`)

    // Rest of the sent emails are yearly emails and thus our target audience
    const targetEmails = documents.map((doc) => doc.email).filter((doc) => !doc.sixMonths)

    // Combine the banned emails (has yearly deal), sent emails and emails in the queue
    const bannedEmailsList = sentEmails.concat(queueEmailList).concat(yearlyEmails)

    // Filter out the banned emails from the target emails
    const targetEmailsFiltered = targetEmails.filter((email) => !bannedEmailsList.includes(email))

    // We now have our target audience for the half year deal emails
    console.log(`Target audience for half year deal emails: ${targetEmailsFiltered.length} emails`)

    // insert the target emails into the target collection:
    // Count how many emails can be added in the queue with the latest timeToSend before adding one day
    let timeCount = count % MAILS_PER_DAY
    // Count how many emails can be added in the queue with the latest timeToSend before adding one hour
    let hoursCount = count % MAILS_PER_HOUR

    let timeToSend =
      timeCount !== 0
        ? latestDate
        : queueDocuments.length > 0
        ? new Date(latestDate.getTime() + 24 * 60 * 60 * 1000) // Add one day
        : new Date(new Date().getTime() + 24 * 60 * 60 * 1000) // Add one day - makes sure the first email is sent tomorrow

    if (timeCount === 0) {
      timeToSend.setHours(10, 0, 0, 0) // Set the initial time to 10:00
    }

    console.log('\nInserting target users into the target collection with appropriate fields...')
    i = 0
    let j = 0
    // create a new progress bar instance and use shades_classic theme
    const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    bar1.start(targetEmailsFiltered.length, j)

    // loop through the target emails and insert them into the target collection
    const userDataList = [] // List to hold all the user data
    const USERS = database.collection('USERS')
    for (const email of targetEmailsFiltered) {
      const user = await USERS.findOne({ _id: email })
      if (!user) {
        console.log(`User with email ${email} not found in the USERS collection`)
        continue
      } else {
        const userData = {
          from_email: send_from,
          sixMonths: true,
          email: user._id,
          language: user.startflowData?.language || 'fi',
          name: user.USER?.[0]?.firstName || 'te',
          timeToSend,
        }

        userDataList.push(userData)

        i += 1
        timeCount += 1
        hoursCount += 1

        // Adjust timeToSend for every MAILS_PER_HOUR emails
        if (hoursCount % MAILS_PER_HOUR === 0) {
          // Add two hours(!!) for every MAILS_PER_HOUR emails
          timeToSend = new Date(timeToSend.getTime() + 60 * 60 * 1000) // Add 1 hour
          timeToSend = new Date(timeToSend.getTime() + 60 * 60 * 1000) // Add 1 hour
        }

        // Adjust timeToSend for every MAILS_PER_DAY emails
        if (timeCount % MAILS_PER_DAY === 0) {
          timeToSend = new Date(timeToSend.getTime() + 24 * 60 * 60 * 1000) // Add one day
          timeToSend.setHours(10, 0, 0, 0) // Set the time to 10:00
        }
      }
      j += 1
      bar1.update(j)
    }

    bar1.stop()

    // Insert all gathered data into the database in one operation
    if (userDataList.length > 0) {
      console.log(
        `Inserting ${userDataList.length} SIX MONTH DEAL users into the target collection...`
      )
      await TARGET_COLLECTION.insertMany(userDataList)
    } else {
      console.log('No SIX MONTH DEAL users to insert into the target collection.')
    }

    console.log('\n\n')
    console.log(`In total, ${i} SIX MONTH DEAL target users saved to new collection.`)
  } catch (err) {
    console.log('An error occurred at i:', i)
    console.error(err)
  } finally {
    // Close the connection after the operations complete
    await client.close()
    await localClient.close()
  }
}

// getHalfYearSubscriptionCustomers()

module.exports = { getHalfYearSubscriptionCustomers }
