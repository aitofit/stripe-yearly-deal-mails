const fs = require('fs').promises

const readEmails = async (fileName) => {
  try {
    const data = await fs.readFile(fileName, 'utf8')
    const emails = data.split(',').map((email) => email.trim())

    return emails
  } catch (err) {
    console.error('Error reading the file:', err)
    return []
  }
}

// const emails = []

// fs.createReadStream(fileName)
//   .pipe(csv())
//   .on('data', (row) => {
//     // Assuming the CSV has a column named 'email'
//     if (row) {
//       emails.push(row.email)
//     }
//   })
//   .on('end', () => {
//     return emails
//   })
//   .on('error', (err) => {
//     throw new Error('Error reading CSV file:', err)
//   })

module.exports = { readEmails }
