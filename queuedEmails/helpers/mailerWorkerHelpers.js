/**
 * Parses email sending results and returns email queue document ids that we're successfully sent.
 * 
 * @param {*} results - email sending results
 * @returns An array of ObjectIds
 */
function getIdsEmailWasSent(results) {
  const idsEmailWasSent = []

  for (const result of results) {
    if (result.status === "fulfilled") {
      // This is specific to current mailing service (Sendgrid).
      // !!!!! NEEDS TO BE CHECKED WITH NEW SERVICE !!!!!!
      const apiResponse = result.value?.info
      const responseData = Array.isArray(apiResponse)
        ? apiResponse[0]?.toJSON?.()
        : apiResponse?.toJSON?.()

      if (responseData?.statusCode === 202) {
        idsEmailWasSent.push(result.value.emailId)
      }
    }
  }

  return idsEmailWasSent
}

module.exports = {
  getIdsEmailWasSent
}