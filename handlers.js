import fs from "fs"
// import ytdl from "ytdl-core"
import ytdl from "@distube/ytdl-core"
import path from "path"
import url from "url"
import clipboardy from "clipboardy"
import { dirs } from "./index.js"
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'

export function validName(name) {
	for (let i of `/\\*:?<>|"`) {
		while (name.includes(i)) {
			name = name.replace(i, `-`)
		}
	}
	return name
}

export function sizeInMB(bytes) {
	const mbs = bytes / 1024 / 1024
	// console.log(mbs)
	if (mbs>10){
	return Math.ceil(mbs).toString()
	} else if (mbs>1){
		return parseFloat(mbs.toFixed(1))
	} else {
		return parseFloat(mbs.toFixed(3))
	}
}
// const bytes = 784593
// console.log(bytes)
// console.log(sizeInMB(bytes))

export function listFormat(format, type, index) {
	let string = ""
	const fps = (format.fps||"**").toString() + " fps"
	const size = sizeInMB(format.contentLength)
	const quality = format.qualityLabel
	if (type == "video") {
		string += `${(index.toString()+'.').padEnd(3)} ${(size+' MB').padEnd(6)} ${quality.padEnd(7)}  ${fps.padEnd(7)} `
	} else if (type == "audio") {
		const abitrate = format.audioBitrate.toString() + " kb/s"
		string += ` | ${(index.toString()+'.').padEnd(3)} ${(size+' MB').padEnd(6)} ${abitrate.padEnd(9)}`
	} else if (type == "full") {
		const abitrate = format.audioBitrate.toString() + " kb/s"
		string += ` | ${(index.toString()+'.').padEnd(3)} ${(size+' MB').padEnd(6)} ${quality.padEnd(6)} ${abitrate.padEnd(9)} ${fps.padEnd(7)}`
	}
	return string  + ' .' + format.container.padEnd(5, ' ')
}

export async function getInfo(url) {
	let vidID = getID(url)
	let jsonFile
	fs.readdirSync(dirs.dataDir).forEach((e) => {
		if (e.includes(vidID)) {
			jsonFile = path.join(dirs.dataDir, e)
		}
	})
	try {
		console.log("-> Searchign For Database...")
		if (!jsonFile) {
			throw new Error("-> No Database!")
		}
		console.log("-> Reading DataBase...")
		const infoString = fs.readFileSync(jsonFile)
		var info = await JSON.parse(infoString)
		console.log("-> Database is ready.")
	} catch (error) {
		console.log(error.message)
		console.log("-> Getting data from YouTube.")
		var info = await ytdl.getInfo(url)
		const author = validName(info.videoDetails.author.name)
		const title =
			validName(info.videoDetails.title) + " -(" + author + ") " + vidID + " "
		console.log("-> vidId:", vidID)
		console.log("-> Title:", title)
		console.log("-> Saving Database.")
		fs.writeFile(
			path.join(dirs.dataDir, title) + ".json",
			JSON.stringify(info),
			(err) => {
				if (err) {
					console.log(err)
				}
				console.log(`-> Info was written.`)
			}
		)
	}
	return info
}

function distictFormatsFromBasicInfo(formats) {
	const fformats = []
	const vformats = []
	const aformats = []
	formats.forEach((e) => {
		// console.log(e)
		if (e.mimeType.split(",").length > 1) {
			fformats.push(e)
		} else if (e.mimeType.split("/")[0] == "video") {
			vformats.push(e)
		} else if (e.mimeType.split("/")[0] == "audio") {
			aformats.push(e)
		}
	})
	return {
		fformats: fformats,
		vformats: vformats,
		aformats: aformats,
	}
}

export function getID(url) {
	if (url.includes("tu.be/")) {
		return url.split("tu.be/")[1].slice(0, 11)
	} else if (url.includes("shorts/")) {
		return url.split("shorts/")[1].slice(0, 11)
	} else if (url.includes("watch?v=")) {
		return url.split("watch?v=")[1].slice(0, 11)
	} else {
		return url.trim().slice(0, 11)
	}
}

export function merge(videoPath, audioPath){
	if (typeof(videoPath)!='string'||typeof(audioPath)!='string') {
		return
	} else {
		console.log('-> Merging...')
	}
	// Set ffmpeg path (if required)
	ffmpeg.setFfmpegPath(ffmpegPath);

	const outPath = path.join(dirs.video_dir, path.basename(videoPath))
	// Merge video and audio
	ffmpeg()
		.input(videoPath)   // input video
		.input(audioPath)   // input audio
		.outputOptions('-c:v copy')  // copy video codec to avoid re-encoding
		// .outputOptions('-c:a aac')   // set audio codec (optional)
		.outputOptions('-map 0:v:0') // map video stream from first input
		.outputOptions('-map 1:a:0') // map audio stream from second input
		.save(outPath)    // save the output file
		.on('end', () => {
			console.log('Merging finished!');
		})
		.on('error', (err) => {
			console.error('Error: ', err);
		});
}

function countElements(arr) {
  const counts = {};
  
  arr.forEach((element) => {
    counts[element] = (counts[element] || 0) + 1;
  });
  
  return counts;
}

// check if a video haave two similar itag
function check_itag(){
	const dirPath = String.raw`D:\Learn\NodeJsLearn\PracticeNode\vdown2\data`
	fs.readdir(dirPath, (err, files)=>{
		if (err){console.error('=> Error in reading folder\n', err)}
		files.forEach(filename=>{
			const jsonObj = JSON.parse(fs.readFileSync(path.join(dirPath, filename)))
			const formats = Array.from(jsonObj.formats||[])
			const itags = formats.map(e=>e.itag)
			const counts = countElements(itags)
			for (let i of itags){
				if(counts[i]>1){
					console.log('\n', filename)
					console.log(formats.filter(format=>format.itag==i)[0]['contentLength'])
					console.log(i, '->', counts[i])
				}
			}
			// if (count[1]>1){
				// console.log(count[1])
			// }
			// }
			// formats.forEach(format=>{
			// 	const itag = format.itag
			// 	console.log(itag)
			// })
		})
	})
}
