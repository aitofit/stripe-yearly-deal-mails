const dotenv = require('dotenv')
dotenv.config({ path: `.env.${process.env.NODE_ENV}` })

const { runFindUsers } = require('./findUsers')
const { runEmailQueue } = require('./queuedEmails/jobs/mailerWorker')

const main = async () => {
  // Run the program and print any thrown exceptions
  console.log('Updating the target users...')
  await runFindUsers().catch(console.dir)

  // return

  console.log('----------------------------------------------------------------------------------')
  console.log('Processing the email queue...')
  let { queueLen, sentMails } = runEmailQueue().catch(console.dir)

  let sumSentMails = sentMails

  // Run the email queue until it is empty
  while (queueLen > 0) {
    const res = await runEmailQueue().catch(console.dir)
    queueLen = res.queueLen
    sentMails = res.sentMails
    sumSentMails += sentMails
  }

  console.log('All mails sent!')
  console.log(`Total emails sent: ${sumSentMails}`)
}

main()
