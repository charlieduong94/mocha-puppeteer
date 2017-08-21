// TODO: accept globs for pulling in test files,
// then pass them to lasso

require('marko/node-require').install()
require('lasso/node-require-no-op').enable('.less', '.css')

require('marko/browser-refresh').enable()
require('lasso/browser-refresh').enable('*.marko *.css *.less')

const puppeteer = require('puppeteer')

const EventEmitter = require('events')
const path = require('path')

const marko = require('marko')
const lasso = require('lasso')

const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const serve = require('koa-static')
const mount = require('koa-mount')
const Router = require('koa-path-router')

const glob = require('glob')

const testPageTemplate = marko.load(require('./pages/test-page'))

class TestRunner extends EventEmitter {
  constructor (options = {}) {
    super()

    const { testsGlob } = options

    const files = glob.sync(testsGlob)
    console.log(testsGlob)

    const testFiles = files.map((file) => {
      return `require-run: ${path.resolve(file)}`
    })

    const staticDir = `${process.cwd()}/.mocha-puppeteer`

    const app = this._app = new Koa();
    const router = new Router({
      middleware: [ bodyParser() ]
    })

    router.get('/', async (ctx) => {
      ctx.type = 'html'

      const pageLasso = lasso.create({
        outputDir: staticDir,
        minify: false,
        bundlingEnabled: false,
        fingerprintsEnabled: false
      })

      const dependencies = [
        'mocha/mocha.css',
        'mocha/mocha.js',
        'superagent/superagent.js',
        `require-run: ${require.resolve('./pages/test-page/setup')}`,

        // inject test files
        ...testFiles,

        `require-run: ${require.resolve('./pages/test-page/run-tests')}`,
      ]

      ctx.body = testPageTemplate.stream({
        lasso: pageLasso,
        dependencies
      })
    })

    router.post('/end-test', async (ctx) => {
      this._server.close()
      this._browser && this._browser.close()

      const { errorMsg, testsPassed } = ctx.request.body

      if (errorMsg) {
        this.emit('error', new Error(errorMsg))
      } else {
        this.emit('complete', {
          testsPassed
        })
      }
    })

    app.use(router.getRequestHandler())
    app.use(mount('/static', serve(staticDir)))
  }

  start () {
    return new Promise((resolve, reject) => {
      this._server = this._app.listen(8000, async () => {
        const browser = this._browser = await puppeteer.launch()
        const page = await browser.newPage()

        page.on('console', (...args) => {
          console.log(...args)
        })

        await page.goto('http://localhost:8000')
      })
    })
  }
}

module.exports = TestRunner
