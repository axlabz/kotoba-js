import 'jszip'
import * as fs from 'fs'
import * as path from 'path'

import * as JSZip from 'jszip'
import * as kana from 'kana'

import { Dictionary, dictionaryInfo, importSource, Tag } from './import'
import { optional, promisify } from './util'

const CONFIG_OUTPUT_DICT_INFO = false
const CONFIG_NORMALIZE_READING = false

const readFile = promisify(fs.readFile)

if (require.main === module) {
	importDir('./data/source/').catch((err: Error) => {
		console.error(err)
	})
}

async function importDir(dirName: string) {
	const timerImport = 'Imported files'
	console.time(timerImport)

	// List all zip files in the source data directory
	const dirList = await new Promise<string[]>((resolve, reject) => {
		fs.readdir(dirName, (err, files) => (err ? reject(err) : resolve(files)))
	})
	const files = dirList.filter((it) => /\.zip$/i.test(it)).map((it) => path.join(dirName, it))

	// Load all files
	const dictionaries: Dictionary[] = []
	for (const fileName of files) {
		const dict = await importFile(fileName)
		dictionaries.push(dict)
	}

	console.log('')
	console.timeEnd(timerImport)

	//========================================================================//
	// Processing
	//========================================================================//

	const timerProcessing = 'Processing'
	console.time(timerProcessing)

	//
	// Tag merging
	//

	const tags = mergeTags(dictionaries)
	console.log(`Merged ${tags.size} tags`)

	let totalEntries = 0
	const mapUnique = new Map<string, number>()
	const mapTerms = new Map<string, number>()
	const mapTermsAndReading = new Map<string, number>()
	const mapGlossary = new Map<string, number>()
	const mapGlossaryAndReading = new Map<string, number>()

	for (const dict of dictionaries) {
		for (const term of dict.terms) {
			if (CONFIG_NORMALIZE_READING) {
				term.reading = kana.to_hiragana(term.reading || term.expression)
			}

			totalEntries++
			mapTerms.set(term.expression, (mapTerms.get(term.expression) || 0) + 1)

			const termAndReading = `${term.expression}, ${term.reading}`
			mapTermsAndReading.set(termAndReading, (mapTermsAndReading.get(termAndReading) || 0) + 1)

			const glossaryText = term.glossary.join(', ')
			mapGlossary.set(glossaryText, (mapGlossary.get(glossaryText) || 0) + 1)

			const uniqueKey = `${termAndReading}, ${glossaryText}`
			mapUnique.set(uniqueKey, (mapUnique.get(uniqueKey) || 0) + 1)

			const glossaryKey = `${term.reading}, ${glossaryText}, ${term.definition_tags.join(':')}`
			mapGlossaryAndReading.set(glossaryKey, (mapGlossaryAndReading.get(glossaryKey) || 0) + 1)
		}

		if (CONFIG_OUTPUT_DICT_INFO) {
			console.log(`\n${dictionaryInfo(dict, { indent: '    ' })}\n`)
		}
	}

	console.timeEnd(timerProcessing)

	console.log(`\n`)
	console.log(`Total entries   : ${totalEntries}`)
	console.log(`Unique entries  : ${mapUnique.size}`)
	console.log(`Unique terms    : ${mapTerms.size}`)
	console.log(`Unique readings : ${mapTermsAndReading.size}`)
	console.log(`Unique glossary : ${mapGlossary.size}`)
	console.log(`Unique glossary/readings : ${mapGlossaryAndReading.size}`)

	let total = 0
	let max = 0
	let maxKey = ''
	for (const [k, v] of mapGlossaryAndReading) {
		total += v
		if (v > max) {
			max = v
			maxKey = k
		}
		max = Math.max(max, v)
	}

	const mean = total / mapGlossaryAndReading.size

	let s = 0
	for (const v of mapGlossaryAndReading.values()) {
		const d = v - mean
		s += d * d
	}

	const std = Math.sqrt(s / mapGlossaryAndReading.size)

	console.log(`\n`)
	console.log(`Glossary max : ${max} (${maxKey})`)
	console.log(`Glossary avg : ${mean}`)
	console.log(`Glossary std : ${std}`)

	console.log(`\n`)
}

async function importFile(fileName: string) {
	const data = await readFile(fileName)
	const zip = await JSZip.loadAsync(data)

	console.log(`\nImporting ${fileName}...`)
	const dict = await importSource({
		name: fileName,
		list: zip.files,
		file: (name: string) => {
			return zip.files[name].async('string')
		},
	})
	console.log(`...imported ${dictionaryInfo(dict, { short: true })}`)

	return dict
}

/**
 * Merge tags from all dictionaries into a single tag collection with unique
 * identifiers. Compatible tags with the same name are merged together, while
 * incompatible tags with name collisions are given a unique id.
 *
 * Returns a map of unique tag IDs to tags. The original name of the tags is
 * kept (since it is meant to be used for display), but all usages in the
 * dictionary are updated to reference the unique ID instead of the name.
 */
function mergeTags(dictionaries: Dictionary[], args = optional({ deleteUnused: false, deleteEmpty: false })) {
	// Map the tags from all dictionaries. The keys of the dictionary are the
	// tag ids which are referenced by entries, while the name of the tag is
	// the originally defined name.
	const tags = new Map<string, Tag>()
	const tagUsage = new Map<string, number>()
	for (const dict of dictionaries) {
		if (!dict.tags.length) {
			continue
		}

		// We want to generate a unique identifier for each tag (as there are
		// name collisions between them), but we also want to merge tags that
		// are equivalent between dictionaries.

		const byName = new Map(dict.tags.map((x) => [x.name, x])) // All tags for the current dictionary
		const mapped = new Map<string, string>() // current mapping for this dictionary
		const useTag = (tagName: string) => tagUsage.set(tagName, (tagUsage.get(tagName) || 0) + 1)
		const mapTag = (tagName: string, used: boolean) => {
			const mappedId = mapped.get(tagName)
			if (mappedId) {
				used && useTag(mappedId)
				return mappedId
			}

			const tag = byName.get(tagName) || { name: tagName, description: '', category: '', order: 0, score: 0 }

			// Find an available id for the tag. First try the tag's own name,
			// and then appends a counter (e.g. `tag`, `tag-2`, `tag-3`...)
			let counter = 1
			let id = tagName
			for (;;) {
				const current = tags.get(id)
				if (!current) {
					// There's no tag for the current id, so we can save it
					tags.set(id, { ...tag })
					mapped.set(tagName, id) // save the local mapping
					used && useTag(id)
					return id
				} else {
					// Check if we can merge the tags that have the same name...
					const canMerge =
						// ...categories must be the same, or one of them must be empty
						(tag.category === current.category || !tag.category || !current.category) &&
						// ...descriptions must be the same, or one of them must be empty
						(tag.description === current.description || !tag.description || !current.description)
					if (canMerge) {
						// Fill any missing information from the current tag
						current.category ||= tag.category
						current.description ||= tag.description
						current.order ||= tag.order
						current.score ||= tag.score

						// Save the local mapping and return
						mapped.set(tagName, id)
						used && useTag(id)
						return id
					}
				}

				// Got a name collision and could not merge, try the next increment
				counter++
				id = `${tagName}-${counter}`
			}
		}

		// Start by mapping the actual defined tags. It is okay if not all are
		// defined in this, but we don't want to miss a defined but unused tag
		// as it may be used in another dictionary.
		for (const it of dict.tags) {
			mapTag(it.name, false)
		}

		// Apply the mapping to terms and kanji. Any undefined tags will end up
		// being defined by the mapping function (all empty, except for the name).

		// Apply the mapping to all terms.
		for (const it of dict.terms) {
			it.term_tags = it.term_tags.map((x) => mapTag(x, true))
			it.definition_tags = it.definition_tags.map((x) => mapTag(x, true))
			it.rules = it.rules.map((x) => mapTag(x, true))
		}

		// Apply the mapping to all kanji
		for (const it of dict.kanji) {
			it.tags = it.tags.map((x) => mapTag(x, true))

			const mappedStats: { [key: string]: string } = {}
			for (const key of Object.keys(it.stats)) {
				mappedStats[mapTag(key, true)] = it.stats[key]
			}
			it.stats = mappedStats
		}
	}

	for (const [key, val] of tags) {
		// Check for an empty tag (those are generated by the mapping)
		const empty = args && args.deleteEmpty && !(val.category || val.description || val.order || val.score)
		// Check for an unused tag
		const unused = args && args.deleteUnused && !tagUsage.get(key)
		if (empty || unused) {
			tags.delete(key)
		}
	}

	return tags
}
