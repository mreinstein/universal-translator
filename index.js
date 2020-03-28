import bodyParser   from 'body-parser'
import compression  from 'compression'
import cookieParser from 'cookie-parser'
import delay        from 'delay'
import express      from 'express'
import helmet       from 'helmet'
import path         from 'path'
import { wrap as safeHandler } from 'async-middleware'
import serveStatic  from 'serve-static'
import session      from 'express-session'
import translate    from './translate.js'


const PORT = 5000

const app = express()

app.disable('x-powered-by')    // don't broadcast server info

//app.engine('html', mustache())
//app.set('view engine', 'html')
//app.set('views', __dirname + '/views')

//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(compression())
app.use(helmet())
app.use(serveStatic(__dirname + '/public'))
//app.use('/', express.static('public'))


const NINETY_DAYS_IN_MILLISECONDS = 7776000000
const SECURE_COOKIE = (process.env.SECURE_COOKIE || '').trim().toLowerCase() === 'true'

if (SECURE_COOKIE) {
  // set to true when running node behind a reverse proxy or load balancer
  // http://expressjs.com/en/4x/api.html#trust.proxy.options.table
  app.set('trust proxy', 1) // trust first proxy
}


// all routes below this line are API calls and should never cache.
app.use(function (req, res, next) {
  const val = 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'
  res.set('Cache-Control', val)
  res.set('Pragma', 'no-cache')
  return next()
})


const messages = [ ]


app.post('/chat', async function (req, res) {
	let { srcLanguage, text, uname } = req.body

	text = text.trim()
	uname = uname.trim()
	srcLanguage = srcLanguage.trim()

	if (text.length > 256 || text.length < 2)
		return res.status(400).json({ e: 'too short' })

	if (srcLanguage !== 'en' && srcLanguage !== 'fr' && srcLanguage !== 'es')
		return res.status(400).json({ e: 'invalid src lang' })

	if (uname.length > 24)
		uname = uname.substring(0, 24)

	const texts = {
		en: '',
		es: '',
		fr: ''
	}

	const languageTargets = Object.keys(texts)

	const toTranslate = Object.keys(texts).filter((lang) => lang !== srcLanguage)
	
	let results

	try {
		results = await Promise.all(toTranslate.map((targetLang) => translate({ text, srcLang: srcLanguage, targetLang })))
		//console.log('b')
		//console.log('results:', results)
	} catch (er) {
		console.log('error translating:', er)
		res.status(400).json({ e: 'translation failed' })
	}

	results.forEach(function (r, idx) {
		const L = toTranslate[idx]
		texts[L] = r.translatedText
	})

	texts[srcLanguage] = text

	messages.push({
		originalText: text,
		detectedSourceLanguage: results[0].detectedSourceLanguage || srcLanguage,
		texts,
		t: Date.now(),
		uname
	})

	res.status(200).send('OK')
})

app.get('/poll', safeHandler(async function (req, res) {

  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  let lastHash
  let connectionOpen = true, lasthash = req.headers['last-event-id']
  let sentMessageCount = 0

  req.on('close', () => { connectionOpen = false })

  const writeSSE = function ({ id, event, data }) {
    if (typeof id !== 'undefined')
      res.write(`id: ${id}\n`)

    res.write(`event: ${event}\n`)

    res.write(`data: ${JSON.stringify(data)}\n\n`)

    // support running within the compression middleware
    if (res.flush)
      res.flush()
  }

  while (connectionOpen) {
    await delay(100)  // poll every 100ms for game state and chat updates

    const newMessageCount = messages.length - sentMessageCount

    if (newMessageCount > 0) {
    	// there are new messages to receive :)
    	const msg = messages.slice(sentMessageCount, messages.length)
    	writeSSE({ id: Math.random(), event: 'chat', data: msg })

    	sentMessageCount = messages.length
    }
  }

  res.end()
}))



app.listen(PORT)

console.log(`started web server on port ${PORT}`)
