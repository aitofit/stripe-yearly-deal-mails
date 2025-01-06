// Gather user ids from a collection

const LATELY_UPDATED = 3 // months
const LATELY_REGISTERED = 14 // days

const MongoClient = require('mongodb').MongoClient
const cliProgress = require('cli-progress')
const { readEmails } = require('./readCsvEmails')

// const production = true
const writeToLocalDBOnly = true // Do not do any writing operations to prod db if true

// Replace the uri string with your MongoDB deployment's connection string
const localUri = 'mongodb://0.0.0.0:27017?directConnection=true' // local mongodb probably needs the directConnection flag set

const client = new MongoClient(process.env.DB_URI, {
  connectTimeoutMS: 30000,
})
const localClient = new MongoClient(localUri, { connectTimeoutMS: 30000 })

const isLatelyUpdated = (user) => {
  const lastUpdated = new Date(user.LAST_UPDATED).getTime()
  const now = Date.now()
  const diff = now - lastUpdated
  const days = diff / (1000 * 60 * 60 * 24)
  return days <= 30 * LATELY_UPDATED // If updated in the last 3 months return true
}

const isLatelyRegistered = (user) => {
  const registerdAt = user.USER?.[0]?.signUpDate
  if (!registerdAt) {
    // If no registration date, return true so that the user is filtered out anyway
    return true
  }
  const registered = new Date(registerdAt).getTime()
  const now = Date.now()
  const diff = now - registered
  const days = diff / (1000 * 60 * 60 * 24)
  return days <= LATELY_REGISTERED // If registered in the last 14 days return true
}

const filterOutUsers = (user, bannedEmails, sentEmails) => {
  // check if banned
  if (bannedEmails.includes(user._id) || sentEmails.includes(user._id)) {
    return false
  }
  // Check if not updated in the last LATELY_UPDATE months
  if (!isLatelyUpdated(user)) {
    return false
  }
  // Check if registered in the last LATELY_REGISTERED days
  if (!isLatelyRegistered(user)) {
    return false
  }
  // Check if user does not have appstore or play store payment info
  if (!user.paymentInfo?.appStore && !user.playStoreData) {
    return false
  }
  const language = user.startflowData?.language
  const lngLower = language?.trim?.().toLowerCase?.() ?? ''
  if (language && !lngLower?.startsWith('fi-')) {
    // We want to target only finnish users
    return false
  }

  return true
}

async function run() {
  try {
    // Read the "banned" emails from the CSV file
    const bannedEmails = await readEmails('banned_emails.csv')

    console.log(`bannedEmails contains ${bannedEmails.length} emails`)

    const database = client.db(process.env.DB_NAME)
    const USERS = database.collection('USERS')
    const localDB = writeToLocalDBOnly ? localClient.db('Main') : database
    const TARGET_COLLECTION = localDB.collection('YearDealTargetUsers')

    const SentEmailscollection = writeToLocalDBOnly
      ? localDB.collection('SentYearDealEmails')
      : database.collection('SentYearDealEmails')

    // Fetch all documents with only the "email" field
    const queueDocuments = await TARGET_COLLECTION.find({}, { projection: { email: 1 } }).toArray()
    // Extract emails into a simple array
    const queueEmailList = queueDocuments.map((doc) => doc.email)

    console.log(`Email queue already contains ${queueEmailList.length} emails`)

    // Fetch all documents with only the _id field (email string)
    const documents = await SentEmailscollection.find({}, { projection: { email: 1 } }).toArray()
    // Extract emails into a simple array
    const sentEmails = documents.map((doc) => doc.email)

    console.log(`Sent emails already contains ${sentEmails.length} emails`)

    // Combine the banned emails, sent emails and emails in the queue
    const emailList = sentEmails.concat(queueEmailList)

    const query = {}
    const usersCursor = await USERS.find(query)

    console.log('Querying for appropriate users...')
    let i = 0
    let j = 0
    let timeToSend = new Date()

    // create a new progress bar instance and use shades_classic theme
    const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    bar1.start(await usersCursor.count(), j)

    for await (const user of usersCursor) {
      if (filterOutUsers(user, bannedEmails, emailList)) {
        const userData = {
          email: user._id,
          language: user.startflowData?.language || 'fi',
          name: user.USER?.[0]?.firstName || 'te',
          timeToSend,
        }

        await TARGET_COLLECTION.insertOne(userData)

        i += 1

        // Adjust timeToSend for every 1000 users
        if (i % 1000 === 0) {
          timeToSend = new Date(timeToSend.getTime() + 24 * 60 * 60 * 1000) // Add one day
        }
      }
      j += 1
      bar1.update(j)
    }

    bar1.stop()

    console.log('\n\n')
    console.log(`In total, ${i} target users saved to new collection.`)
  } finally {
    // Close the connection after the operations complete
    await client.close()
    await localClient.close()
  }
}

module.exports = { runFindUsers: run }
