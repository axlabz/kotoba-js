import 'jszip'
import * as fs from 'fs'
import * as path from 'path'

import * as JSZip from 'jszip'

import { importSource, outputDict } from './import'
import { promisify } from './util'

const readFile = promisify(fs.readFile)

if (require.main === module) {
	importDir('./data/source/').catch((err: Error) => {
		console.error(err)
	})
	// importFile('./data/source/jmdict_english.zip').catch((err: Error) => {
	// 	console.error(err)
	// })
}

async function importDir(dirName: string) {
	const files = await new Promise<string[]>((resolve, reject) => {
		fs.readdir(dirName, (err, files) => (err ? reject(err) : resolve(files)))
	})
	const toImport = files.filter((it) => /\.zip$/i.test(it)).map((it) => path.join(dirName, it))
	for (const fileName of toImport) {
		const dict = await importFile(fileName)
		outputDict(dict)
		console.log('')
	}
}

async function importFile(fileName: string) {
	const data = await readFile(fileName)
	const zip = await JSZip.loadAsync(data)

	console.log(`Importing ${fileName}...\n`)
	return await importSource({
		name: fileName,
		list: zip.files,
		file: (name: string) => {
			return zip.files[name].async('string')
		},
	})
}
