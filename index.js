import fs from "fs"
import ytdl from "@distube/ytdl-core"
import path from "path"
import url from "url"
import clipboardy from "clipboardy"
import readline from "readline"
import { getID } from "./handlers.js"
import { listFormat , merge, sizeInMB } from "./handlers.js"
import { validName } from "./handlers.js"
import { getInfo } from "./handlers.js"
import { error } from "console"

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// process.chdir(__direname)

export const dirs = {
	dataDir: path.join(__dirname, "data"),
	video_dir: path.join(__dirname, "videos"),
	audio_dir: path.join(__dirname, "audio"),
	v_dir: path.join(__dirname, "-v"),
	a_dir: path.join(__dirname, "-a"),
}

// console.log(fs.existsSync(dirs.dataDir))

Object.keys(dirs).forEach((key) => {
	const dir = dirs[key]
	if (!fs.existsSync(dir)) fs.mkdirSync(dir)
})

// console.log(dirs.v_dir)

// fs.mkdirSync(dirs.dataDir, { recursive: true })

const vidURL =
	"https://www.youtube.com/watch?v=gNmOnXnGILE&pp=ygUQYWR2YW5jZWQgbm9kZSBqcw%3D%3D"

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
})

async function input(question) {
	return new Promise((resolvedResult) => rl.question(question, resolvedResult))
}

const down = async (url) => {
	// Getting json obj for video info.
	const info = await getInfo(url)

	// video properties' variables.
	const vidID = info.videoDetails.videoId
	const author = validName(info.videoDetails.author.name)
	const title = validName(info.videoDetails.title + " -(" + author + ") ") + vidID
	console.log("-".repeat(70) + "\n" + title + "\n" + "-".repeat(20))

	const formats = info.formats
	formats.sort((a, b) => a.contentLength - b.contentLength)

	const fformats = ytdl.filterFormats(formats, "videoandaudio")
	const vformats = ytdl.filterFormats(formats, "videoonly")
	const aformats = ytdl.filterFormats(formats, "audioonly")
	const alen = aformats.length
	const flen = fformats.length
	let viewString = ""
	vformats.forEach((e, i) => {
		viewString += listFormat(e, "video", i + 1)
		if (i < alen) {
			viewString += listFormat(aformats[i], "audio", i + 1)
		}
		if (i < flen) {
			viewString += listFormat(fformats[i], "full", i + 1)
		}
		viewString += "\n"
	})
	console.log(viewString)
	let userInput = await input("Choose Format: ")
	rl.close()
	const inputList = userInput.split(" ").map((e) => Number(e))
	console.log(inputList)
	if (inputList.length == 1) {
		downFormat(url, fformats[inputList[0] - 1], title, "full", dirs.video_dir)
	} else if (inputList.length == 2) {
		const nv = inputList[0]
		const na = inputList[1]
		let vfilePath, afilePath
		if (nv) downFormat(url, vformats[nv-1], title, "video", dirs.v_dir)
			.then(result => {
				if (na){
					vfilePath = result
					merge(result, afilePath)
				} else {
					fs.rename(result, path.join(dirs.video_dir, path.basename(result)), err=>{
						if (err) console.log(err)
							console.log('-> Moved to video folder.')
					})
				}
		})
		if (na) downFormat(url, aformats[na-1], title, "audio", dirs.a_dir)
			.then(result => {
				if (nv){
					afilePath = result
					merge(vfilePath, result)
				} else {
					fs.rename(result, path.join(dirs.audio_dir, path.basename(result)), err=>{
						if (err) console.log(err)
							console.log('-> Moved to audio folder.')
					})
				}
		})
	} else {
		console.log("-> Invalid input")
		down(url)
	}
}

// down(vidURL)


async function downFormat(url, format, title, type, dirPath){
	let done = false
	const filename = title + '.' + format.container
	const downPath = path.join(dirPath, filename)
	console.log(`=> Downloading ${type}: ${listFormat(format, type, '-')}`)
	const formatSize = format.contentLength || '??'
	let startBytes = 0
	const formatFilter = f=>{
		return format.itag? f.itag==format.itag:f.contentLength==format.contentLength
	}
	let videoStream, writeStream
	if (fs.existsSync(downPath)){
		startBytes = fs.statSync(downPath).size
		if (startBytes == formatSize){
			console.log(`=> ${type} Already downloaded!`)
			return Promise.resolve(downPath)
			done = true
		} else {
		videoStream = ytdl(url, {filter: formatFilter, range:{start:startBytes}})
		writeStream = fs.createWriteStream(downPath, {flags: 'a'})
		}
	} else {
		videoStream = ytdl(url, {filter: formatFilter})
		writeStream = fs.createWriteStream(downPath)
	}
	if (!done){
	// videoStream.on('end', ()=>console.log('=> video stream end!'))
	writeStream.on('error', (err)=> console.log('=> writeStream error:', err))
	videoStream.on('progress', (chunkLength, downloaded, total) => {
		process.stdout.write(`Downloading ${type}: ${sizeInMB(startBytes+downloaded)} of ${sizeInMB(formatSize)} bytes -- chunkLength: ${chunkLength}\r`)
	})
	writeStream.on('finish', ()=> {
		console.log(`=> ${type} downloaded.`)
		return Promise.resolve(downPath)
	})
	videoStream.pipe(writeStream)
	}
}


async function downformat(url, format, type, title) {
	const filename = title + ' .' + format.container
	const downDir = type=='video'?dirs.v_dir:type=='audio'?dirs.a_dir:dirs.video_dir
	const filePath = path.join(downDir, filename)
	// const videoOptions = {filter:format.contentLength?}
	console.log(`-> Downloading ${type}: ${filename} \n${await listFormat(format, type, "-")}`)

	if (fs.existsSync(filePath)){
		const startBytes = fs.statSync(filePath).size
		return new Promise((resolve, reject)=>{
		const videoStream = ytdl(url, {
			filter: f=>f.contentLength == format.contentLength,
			range: { start: startBytes }
	})
	const writeStream = fs.createWriteStream(filePath, { flags: 'a' })
	videoStream.on('progress', (chunkLength, downloaded, total) => {
			console.log(`Downloaded ${downloaded} of ${total} bytes`)
		})
		videoStream.on('end', () => {
			console.log('Download completed!')
			resolve(filePath)
		})
		writeStream.on("finish", () => {
			console.log(`-> completed: ${type} - ${filename}`)
			resolve(filePath)
		})
		videoStream.pipe(writeStream)
	})
} else {
	
	const videoStream = ytdl(url,  {filter: f=>f.contentLength == format.contentLength} )
	const writeStream = fs.createWriteStream(filePath)
	videoStream.on('progress', (chunkLength, downloaded, total) => {
			console.log(`Downloaded ${downloaded} of ${total} bytes`)
		})
	return new Promise((resolve, reject)=>{
		writeStream.on("error", (err) => {
			console.log("-> error:", err)
		})
		writeStream.on("close", (err) => {
			console.log("-> closed!")
		})
		writeStream.on("finish", () => {
			console.log(`-> completed: ${type} - ${filename}`)
			resolve(filePath)
		})
	})
	videoStream.pipe()
	}
	}

	
	const formatType = format =>
		format.hasVideo && format.hasAudio
	? "full"
	: format.hasVideo
	? "video"
	: "audio"
	
	down(clipboardy.readSync())



	