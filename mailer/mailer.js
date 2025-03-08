const nodemailer = require('nodemailer')
const nodemailerSendgrid = require('nodemailer-sendgrid')
// const mockTransport = require("./mailerMockTransport")
// const { STORE_TYPE } = require('../stripeDeal/constants')

const MAIL_KEYS = {
  yearlyDeal: 'yearlyDeal',
  halfYearDeal: 'halfYearDeal',
}

const mailerLanguages = ['fi', 'en', 'sv']
const GENERAL_GROUP_ID = 174152
const TRANSACTIONAL_GROUP_ID = 174153
const unsubGroupIds = [GENERAL_GROUP_ID]

const prodTemplates = {
  sender: { name: 'AITOFIT', address: 'valmennus@aitofit.fi' },
  [MAIL_KEYS.yearlyDeal]: {
    fi: 'd-1f51a4df37a64f0192459de7121e0d08',
  },
  [MAIL_KEYS.halfYearDeal]: {
    fi: 'd-0e3d52f4a6044a7193234b1e0f2fd4a1',
  },
}

const getSenderData = () => prodTemplates.sender

const getTemplateIdByLanguage = (key, language) => {
  const defaultLanguage = 'en'
  const lngLower = language?.trim?.().toLowerCase?.() ?? ''

  // Something is wrong if no key
  if (!key || typeof key !== 'string') {
    return null
  }

  // NOTE!
  // If language is not defined, but we have a key, then send email in default language.
  // It's probably better to send something even if we're not sure of language.

  if (mailerLanguages.includes(lngLower)) {
    return prodTemplates[key]?.[lngLower]
  } else if (lngLower?.startsWith('fi-')) {
    // Different finnish versions, like fi-fi
    return prodTemplates[key]?.['fi']
  } else if (lngLower?.startsWith('sv-')) {
    // Different swedish versions, like sv-se
    return prodTemplates[key]?.['sv']
  } else if (lngLower?.startsWith('en-')) {
    // Default all english localizations to 'en'
    return prodTemplates[key]?.['en']
  } else {
    // Any other and not defined localization
    return prodTemplates[key]?.[defaultLanguage]
  }
}

// const transport = nodemailer.createTransport(
//   nodemailerSendgrid({
//     apiKey: process.env.SENDGRID_API_KEY,
//   })
// )

// to test with stdstream, replace transport with
// const transport = nodemailer.createTransport(mockTransport);

// const sendPasswordResetEmail = ({ email, url, language }) => {
//   const templateId = getTemplateIdByLanguage(MAIL_KEYS.reset, language)
//   if (!templateId) {
//     throw new Error(
//       `Couldn't find template id for sending '${MAIL_KEYS.reset}' email in language '${language}' to '${email}'`
//     )
//   }
//   transport.sendMail({
//     from: prodTemplates.sender,
//     to: email,
//     subject: 'Salasanan palautus',
//     dynamic_template_data: { url },
//     templateId,
//     asm: {
//       group_id: TRANSACTIONAL_GROUP_ID,
//       unsubscribe_group_ids: unsubGroupIds,
//     },
//   })
// }

// const sendWelcomeEmail = ({ email, firstName, minutesDelay, templateKey, language }) => {
//   if (process.env.NODE_ENV === 'development') return

//   const templateId = getTemplateIdByLanguage(templateKey, language)
//   if (!templateId) {
//     throw new Error(
//       `Couldn't find template id for sending '${templateKey}' email in language '${language}' to '${email}'`
//     )
//   }
//   const unixTimeNow = Math.floor(new Date().getTime() / 1000)
//   transport.sendMail({
//     from: prodTemplates.sender,
//     to: email,
//     subject: 'Hyviä treenejä!', // Subject is overridden by template
//     dynamic_template_data: { firstName },
//     templateId,
//     asm: {
//       group_id: GENERAL_GROUP_ID,
//       unsubscribe_group_ids: unsubGroupIds,
//     },
//     ...(minutesDelay && { sendAt: unixTimeNow + minutesDelay * 60 }),
//   })
// }

// const sendEmail = ({ email, firstName, minutesDelay, templateId }) => {
//   if (process.env.NODE_ENV === 'development') return
//   const unixTimeNow = Math.floor(new Date().getTime() / 1000)
//   transport.sendMail({
//     from: prodTemplates.sender,
//     to: email,
//     subject: 'AITOFIT tiedottaa', // Subject is overridden by template
//     dynamic_template_data: { firstName },
//     templateId,
//     asm: {
//       group_id: GENERAL_GROUP_ID,
//       unsubscribe_group_ids: unsubGroupIds,
//     },
//     ...(minutesDelay && { sendAt: unixTimeNow + minutesDelay * 60 }),
//   })
// }

// const sendYearlyDealErrorEmail = (
//   errorData,
//   errorMessage,
//   errorReceiverEmail,
//   minutesDelay = false
// ) => {
//   if (process.env.NODE_ENV === 'development') return

//   const unixTimeNow = Math.floor(new Date().getTime() / 1000)

//   const message =
//     '<div>' +
//     '<p>' +
//     errorData?.userEmail +
//     '<br>' +
//     errorData?.stripeCustomerId +
//     '</p>' +
//     '<br>' +
//     '<p> error: ' +
//     errorMessage +
//     '</p>' +
//     '</div>'

//   return transport.sendMail({
//     from: prodTemplates.sender,
//     to: errorReceiverEmail,
//     subject: 'Virhe vuoden stripe dealin käsittelyssä!',
//     html: message,
//     ...(minutesDelay && { sendAt: unixTimeNow + minutesDelay * 60 }),
//   })
// }

// const sendYearlyDealSuccessResetSubEmail = ({ email, firstName, minutesDelay, language, storeType }) => {
//   if (process.env.NODE_ENV === 'development') return

//   const templateKey =
//     storeType === STORE_TYPE.APP_STORE
//       ? MAIL_KEYS.successStopSubAppstore
//       : null

//   const templateId = getTemplateIdByLanguage(templateKey, language)
//   if (!templateId) {
//     throw new Error(
//       `Couldn't find template id for sending '${templateKey}' email in language '${language}' to '${email} with storeType '${storeType}'`
//     )
//   }
//   const unixTimeNow = Math.floor(new Date().getTime() / 1000)

//   const result = transport
//     .sendMail({
//       from: prodTemplates.sender,
//       to: email,
//       subject: 'Vuoden Aitofit jäsenyyden tilaus', // Subject is overridden by template
//       dynamic_template_data: { firstName },
//       templateId,
//       asm: {
//         group_id: TRANSACTIONAL_GROUP_ID,
//         unsubscribe_group_ids: unsubGroupIds,
//       },
//       ...(minutesDelay && { sendAt: unixTimeNow + minutesDelay * 60 }),
//     })
//     .then((res) => {
//       console.log('sent success reset sub email')
//     })
// }

module.exports = {
  // sendPasswordResetEmail,
  // sendWelcomeEmail,
  // sendEmail,
  // MAIL_KEYS,
  getTemplateIdByLanguage,
  // mailerLanguages,
  getSenderData,
  GENERAL_GROUP_ID,
  unsubGroupIds,
  // sendYearlyDealErrorEmail,
  // sendYearlyDealSuccessResetSubEmail,
}
