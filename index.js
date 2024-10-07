import { exec } from "child_process"
import EventEmitter from "events"
import fs from "fs"
import ytdl from "@distube/ytdl-core"
import path from "path"
import url from "url"
import clipboardy from "clipboardy"
import readline from "readline"
import { getID } from "./handlers.js"
import { listFormat, merge, sizeInMB, saveJSON } from "./handlers.js"
import { validName } from "./handlers.js"
import { getInfo } from "./handlers.js"
import { error } from "console"

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dirs = {
	dataDir: path.join(__dirname, "data"),
	video_dir: path.join(__dirname, "videos"),
	audio_dir: path.join(__dirname, "audio"),
	v_dir: path.join(__dirname, "-v"),
	a_dir: path.join(__dirname, "-a"),
}
dirs.v_data = path.join(dirs.dataDir, "v-data")

// Creating non-existing folders.
Object.keys(dirs).forEach((key) => {
	const dir = dirs[key]
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

const failedFilePath = path.join(dirs.dataDir, "failed.json")
if (!fs.existsSync(failedFilePath)) fs.writeFileSync(failedFilePath, '{}')
const failedVids = JSON.parse(fs.readFileSync(failedFilePath))

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
})

async function input(question) {
	return new Promise((resolvedResult) => rl.question(question, resolvedResult))
}

class Emitter extends EventEmitter {}
const myEmitter = new Emitter

myEmitter.on('download', (jsonObj, title, downPath)=>{
	jsonObj.downloaded = new Date().toLocaleString('en-US', { hour12: false })
	saveJSON(jsonObj, title)
	delete failedVids[jsonObj.videoDetails.videoId]
	fs.writeFileSync(failedFilePath, JSON.stringify(failedVids))
	input(`=> Downloaded: "${downPath}"\n   Press Enter to play!`).then(value=>{
		if (!value){
			exec(`"${downPath}"`, (err, stdout, stderr) => {
				if (err) {
					console.error(`Error: ${err.message}`);
					return;
				}
				if (stderr) {
					console.error(`stderr: ${stderr}`);
					return;
				}
			})
		}
		rl.close()
	})
})

let info


const down = async (vidID) => {

	if (failedVids[vidID]){
		failedVids[vidID].attempts.push(new Date().toLocaleString('en-US', { hour12: false }))
	} else {
		failedVids[vidID] = {title:'', duration:'', attempts:[ new Date().toLocaleString('en-US', { hour12: false })]}
	}
	fs.writeFileSync(failedFilePath, JSON.stringify(failedVids))
	
	// Getting json obj for video info.
	const info = await getInfo(vidID, failedVids)

	
	
	
	//-> video properties' variables.
	// const vidID = info.videoDetails.videoId
	const author = info.videoDetails.author.name
	const title =	validName(info.videoDetails.title + " -(" + author + ") ") + vidID
	console.log("-".repeat(70) + "\n" + title + "\n" + "-".repeat(20))
	const duration = new Date(info.videoDetails.lengthSeconds*1000).toLocaleTimeString('en-US',{ hour12: false, timeZone:'UTC' })

	failedVids[vidID].title = title
	failedVids[vidID].duration = duration
	fs.writeFileSync(failedFilePath, JSON.stringify(failedVids))

	if (info.downloaded) {
		let downloadAgain = await input("=> Aready downloaded. Download again? ")
	} 
	
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
			viewString += " | " + listFormat(aformats[i], "audio", i + 1)
		}
		if (i < flen) {
			viewString += " | " + listFormat(fformats[i], "full", i + 1)
		}
		viewString += "\n"
	})
	console.log(viewString)
	console.log('=> '+ title)
	console.log('=> '+ duration)
	
	let indexInput
	if (info.lastChoice) {
		indexInput =(await input("=> Do you want to download the same formats: ",info.lastChoice)) || info.lastChoice
	} else {
		indexInput = await input("=> Choose Format: ")
	}
	info.lastChoice = indexInput
	// rl.close()
	//-> add details to failed.json

	
	failedVids[vidID].lastChoice = info.lastChoice

	saveJSON(info, title)
	const inputList = indexInput.split(" ").map((e) => Number(e))
	console.log(inputList)

	if (inputList.length == 1) {
		downFormat(vidID, fformats[inputList[0] - 1], title, "full", dirs.video_dir).then(downPath=>{
			myEmitter.emit('download', info, title, downPath)
		})
	} else if (inputList.length == 2) {
		const nv = inputList[0]
		const na = inputList[1]
		let vfilePath, afilePath, finalPath
		if (nv)
			downFormat(vidID, vformats[nv - 1], title, "video", dirs.v_dir).then(
				(result) => {
					if (na) {
						vfilePath = result
						finalPath = merge(result, afilePath)
					} else {
						finalPath = path.join(dirs.video_dir, path.basename(result))
						fs.rename(
							result, finalPath,
							(err) => {
								if (err) console.log(err)
								console.log("-> Moved to video folder.")
							}
						)
					}
					if (finalPath) myEmitter.emit('download', info, title, finalPath)
				}
			)
		if (na)
			downFormat(vidID, aformats[na - 1], title, "audio", dirs.a_dir).then(
				(result) => {
					if (nv) {
						afilePath = result
						finalPath = merge(vfilePath, result)
					} else {
						finalPath = path.join(dirs.audio_dir, path.basename(result))
						fs.rename(
							result, finalPath,
							(err) => {
								if (err) console.log(err)
								console.log("-> Moved to audio folder.")
							}
						)
					}
					if (finalPath) myEmitter.emit('download', info, title, finalPath)
				}
			)
	} else {
		console.log("-> Invalid input")
		down(vidID)
	}
}

// down(vidURL)

function downFormat(url, format, title, type, dirPath) {
	let done = false
	const filename = title + " ." + format.container
	const downPath = path.join(dirPath, filename)
	console.log(`=> Downloading ${type}: ${listFormat(format, type, "-")}`)
	const formatSize = format.contentLength || "??"
	let startBytes = 0
	const formatFilter = (f) => {
		return format.itag
			? f.itag == format.itag
			: f.contentLength == format.contentLength
	}
	let videoStream, writeStream
	if (fs.existsSync(downPath)) {
		startBytes = fs.statSync(downPath).size
		if (startBytes == formatSize) {
			console.log(`=> ${type} Already downloaded!`)
			// return downPath
			done = true
		} else {
			videoStream = ytdl(url, {filter: formatFilter, range: { start: startBytes }})
			writeStream = fs.createWriteStream(downPath, { flags: "a" })
		}
	} else {
	// 	const startMilli = 210000
	// 	const endMilli = startMilli + 30000
	// 	const vidMilli = parseInt(seconds) * 1000
	// 	const bytePerMilli = formatSize / vidMilli 
	// 	videoStream = ytdl(url, { filter: formatFilter , range: {start:bytePerMilli*startMilli, end: bytePerMilli*endMilli}})
		videoStream = ytdl(url, { filter: formatFilter})
		writeStream = fs.createWriteStream(downPath)
	}
	return new Promise((resolve, reject) => {
		if (!done) {
			// videoStream.on('end', ()=>console.log('=> video stream end!'))
			writeStream.on("error", (err) => reject(err))
			videoStream.on("progress", (chunkLength, downloaded, total) => {
				process.stdout.write(
					`Downloading ${type}: ${sizeInMB(startBytes + downloaded)
						.toString()} of ${sizeInMB(formatSize)} MB\r`
				)
			})
			writeStream.on("finish", () => {
				console.log(`=> ${type} downloaded.`)
				resolve(downPath)
			})
			videoStream.pipe(writeStream)
		} else {
			resolve(downPath)
		}
	})
}

const formatType = (format) =>
	format.hasVideo && format.hasAudio
		? "full"
		: format.hasVideo
		? "video"
		: "audio"

export { dirs, failedFilePath, failedVids }


if (url.fileURLToPath(import.meta.url)==process.argv[1]){

	down(getID(clipboardy.readSync()))
	
}
