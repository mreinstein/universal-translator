import  GoogleTranslate from 'google-translate'


const options = { }
const googleTranslate = GoogleTranslate(process.env.GOOGLE_TRANSLATE_API_KEY, options)


export default async function translate ({ text, srcLang, targetLang }) {
	return new Promise(function (resolve, reject) {
		googleTranslate.translate(text, srcLang, targetLang, function(err, translation) {
			if (err)
				return reject(err)

		  resolve(translation)
		})
	})
}
