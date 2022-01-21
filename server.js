import http from 'http'
import createHandler from 'github-webhook-handler'
//import { exec } from 'child_process'
import winston from 'winston'
import winstonDaily from 'winston-daily-rotate-file'
const {combine, timestamp, printf} = winston.format
import mkdirp from 'mkdirp'
import path from 'path'
import chalk from 'chalk'
import 'date-utils'

const util = require('util')
const exec = util.promisify(require('child_process').exec)
const handler = createHandler({ path: '/hook-github', secret: 'secret' })

// logger
let logDir = path.join('./log')
mkdirp.sync(logDir)

const env = process.env.NODE_ENV || 'dev'
let logLevel = env === 'dev' ? 'debug' : 'info'

global.logger = new winston.createLogger({
    format: combine(
        timestamp({
            format: 'YYMMDD:HH:mm:ss.SSS',
        }),
        printf(info => {
            let logLevel = info.level.padEnd(5, ' ')
            if (info.level === 'debug') {
                logLevel = chalk.gray(logLevel)
            } else {
                logLevel = chalk.yellow(logLevel)
            }
            return `[${chalk.cyan(info.timestamp)}:${logLevel}] ${info.message}`
        }),
    ),
    transports: [
        new winston.transports.Console({
            level: logLevel
        }),
        new winstonDaily({
            level: logLevel,
            datePattern: 'YYYYMMDD',
            dirname: logDir,
            filename: `%DATE%.log`,
            maxFiles: 30,
            zippedArchive: true,
        }),
        new winstonDaily({
            level: 'error',
            datePattern: 'YYYYMMDD',
            dirname: `${logDir}/error`,
            filename: `%DATE%.error.log`,
            maxFiles: 30,
            zippedArchive: true,
        }),
    ]
})

logger.debug('main start')

// create server
http.createServer(function (req, res) {
  handler(req, res, function (err) {
    res.statusCode = 404
    //res.end('no such location')
  })
}).listen(4001)

handler.on('/', function (err) {
    res.statusCode = 200
    res.end('alive')
})

handler.on('error', function (err) {
  logger.error('Error:', err.message)
})

handler.on('push', async function (event) {
  try{

    logger.info('push starrt')

    const repository = event.payload.repository.name
    const branch = event.payload.ref
    logger.info(`pushed ${repository} to ${branch}`)
    logger.info(event.payload.toString())

    if( repository === 'node-tmp' && branch === 'refs/heads/main' ){
        const { stdout, stderr } = await exec(`cd /root/app/node-api/ && git pull && npm i && pm2 restart node-api`)
        if (stderr) {
        logger.error(`error: ${stderr}`)
        }
        logger.info(`${stdout}`)
    }
    logger.info('push end')

  }catch(e){
    logger.error('push error occurred:' + e)
    throw e
  }
})

handler.on('issues', function (event) {
  console.log('issue received: %s action=%s: #%d %s',
    event.payload.repository.name, event.payload.action, event.payload.issue.number, event.payload.issue.title)
})

logger.info('hook start')

setInterval(() => logger.info('wait..'), 5000)
