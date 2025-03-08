const SIX_MONTH_PRICE = process.env.SIX_MONTH_PRICE || 'price_1QsQjGHuqNLiyMGxDzPqjRWU' // test mode id
const YEARLY_PRICE = process.env.YEARLY_PRICE || 'price_1Mc6PiHuqNLiyMGxdctmpvXw' // test mode id
const SUPPORTED_PRICES = [SIX_MONTH_PRICE, YEARLY_PRICE]

const createEncodedUrl = (baseUrl, email, priceId) => {
  if (!baseUrl || !email || !priceId) {
    throw new Error('All parameters "baseUrl", "email" and "priceId" parameters are required')
  }
  if (!SUPPORTED_PRICES.includes(priceId)) {
    throw new Error(`Price id "${priceId}" is not supported`)
  }

  const encodedEmail = encodeURIComponent(email)
  return `${baseUrl}/checkout/${priceId}/${encodedEmail}`
}

module.exports = { createEncodedUrl }
