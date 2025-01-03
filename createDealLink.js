const createEncodedUrl = (baseUrl, email) => {
  if (!baseUrl || !email) {
    throw new Error('Both "baseUrl" and "email" parameters are required')
  }

  const encodedEmail = encodeURIComponent(email)
  return `${baseUrl}/checkout/:${encodedEmail}`
}

module.exports = { createEncodedUrl }
