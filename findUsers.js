// Gather user ids from a collection
const DEBUG = false

const LATELY_UPDATED = 1 // months
const LATELY_REGISTERED = 14 // days
const MAILS_PER_DAY = 300
const MAILS_PER_HOUR = 60

const MongoClient = require('mongodb').MongoClient
const cliProgress = require('cli-progress')
const { readEmails } = require('./readCsvEmails')

// const production = true
const writeToLocalDBOnly = false // Do not do any writing operations to prod db if true

// Replace the uri string with your MongoDB deployment's connection string
const localUri = 'mongodb://0.0.0.0:27017?directConnection=true' // local mongodb probably needs the directConnection flag set

const client = new MongoClient(process.env.DB_URI, {
  connectTimeoutMS: 60000,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 60000,
  socketTimeoutMS: 60000,
  // maxPoolSize: 10, // Maximum of 10 connections in the pool
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
    DEBUG && console.log('User has banned email:', user._id)
    return false
  }
  // Check if not updated in the last LATELY_UPDATE months
  if (!isLatelyUpdated(user)) {
    DEBUG && console.log('User not updated lately:', user._id)
    return false
  }
  // Check if registered in the last LATELY_REGISTERED days
  if (isLatelyRegistered(user)) {
    DEBUG && console.log('User registered lately:', user._id)
    return false
  }
  // Check if user does not have appstore or play store payment info
  if (!user.paymentInfo?.appStore && !user.playStoreData) {
    DEBUG && console.log('User has no payment info:', user._id)
    return false
  }
  const language = user.startflowData?.language
  const lngLower = language?.trim?.().toLowerCase?.() ?? ''
  if (language && !lngLower?.startsWith('fi')) {
    // We want to target only finnish users
    DEBUG && console.log('User language is not Finnish:', user._id)
    return false
  }

  return true
}

async function run() {
  let i = 0
  try {
    // Read the "banned" emails from the CSV file
    const bannedEmails = await readEmails('banned_emails.csv')

    console.log(`\nbannedEmails contains ${bannedEmails.length} emails`)

    if (bannedEmails.length < 5) {
      console.log('Banned emails are the following:')
      console.log(bannedEmails)
      console.log('\n')
    }

    const database = client.db(process.env.DB_NAME)
    const USERS = database.collection('USERS')
    // if writeToLocalDBOnly is false, this actually points to the production database
    const localDB = writeToLocalDBOnly ? localClient.db('Main') : database
    const TARGET_COLLECTION = localDB.collection('YearDealTargetUsers')

    const SentEmailscollection = writeToLocalDBOnly
      ? localDB.collection('SentYearDealEmails')
      : database.collection('SentYearDealEmails')

    // Fetch all documents in the queue
    const queueDocuments = await TARGET_COLLECTION.find({}).toArray()

    const latestDate =
      queueDocuments.length > 0
        ? new Date(Math.max(...queueDocuments.map((e) => new Date(e.timeToSend).getTime())))
        : new Date()

    console.log(`Latest timeToSend in the target collection is ${latestDate}`)

    // Next, count how many queued emails have the date latestDate
    const count = queueDocuments.filter(
      (e) => e.timeToSend.getTime() === latestDate.getTime()
    ).length

    console.log(`There are ${count} emails with the latest timeToSend`)

    // Extract emails into a simple array
    const queueEmailList = queueDocuments.map((doc) => doc.email)

    console.log(`Email queue already contains ${queueEmailList.length} emails`)

    // Fetch all documents with only the _id field (email string)
    const documents = await SentEmailscollection.find({}, { projection: { email: 1 } }).toArray()
    // Extract emails into a simple array
    const sentEmails = documents.map((doc) => doc.email)

    console.log(`Sent emails already contains ${sentEmails.length} emails\n`)

    // Combine the banned emails, sent emails and emails in the queue
    const emailList = sentEmails.concat(queueEmailList)

    const query = {}
    const projection = {
      _id: 1,
      LAST_UPDATED: 1,
      paymentInfo: 1,
      playStoreData: 1,
      startflowData: 1,
      USER: 1,
    }
    const usersCursor = await USERS.find(query, { projection })

    console.log('Querying for appropriate users...')
    const userDataList = [] // List to hold all the user data
    i = 0
    let j = 0
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

    // create a new progress bar instance and use shades_classic theme
    const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    bar1.start(await usersCursor.count(), j)
    DEBUG && console.log('\n')

    for await (const user of usersCursor) {
      if (filterOutUsers(user, bannedEmails, emailList)) {
        const userData = {
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
          // Add two hours for every MAILS_PER_HOUR emails
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
      console.log(`Inserting ${userDataList.length} users into the target collection...`)
      await TARGET_COLLECTION.insertMany(userDataList)
    } else {
      console.log('No users to insert into the target collection.')
    }

    console.log('\n\n')
    console.log(`In total, ${i} target users saved to new collection.`)
  } catch (err) {
    console.log('An error occurred at i:', i)
    console.error(err)
  } finally {
    // Close the connection after the operations complete
    await client.close()
    await localClient.close()
  }
}

module.exports = { runFindUsers: run }
