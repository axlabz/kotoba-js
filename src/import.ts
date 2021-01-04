import { optional } from './util'

/**
 * Source is a representation of a data source file (i.e. the Yomichan zip files)
 * that abstracts away all the IO stuff.
 */
export interface Source {
	/** Name of the source. Used only for error messages. */
	name: string

	/** List of files available in the source. Used only for validation. */
	list: { [name: string]: unknown }

	/** Loads a file to a string. */
	file(name: string): Promise<string>
}

/** Type for the imported dictionary. */
export type Dictionary = {
	/** Index metadata for the imported dictionary. */
	index: Index

	/** Terms for the dictionary. */
	terms: Term[]

	/** Kanji entries for the dictionary. */
	kanji: Kanji[]

	/** List of tags for this dictionary. */
	tags: Tag[]

	/** Frequency entries for terms. */
	terms_meta: Meta[]

	/** Frequency entries for kanji. */
	kanji_meta: Meta[]
}

/** Format of the index file. */
export type Index = {
	/** Title of the source file */
	title: string

	/** Format number. */
	format: number

	/** Revision name (informative). */
	revision: string

	/** Unused flag. */
	sequenced: boolean
}

/**
 * Term from an imported dictionary.
 *
 * Each entry contains a single definition for the term given by `expression`.
 * The definition itself consists of one or more `glossary` items.
 */
export type Term = {
	/** Term expression. */
	expression: string

	/** Kana reading for this term. */
	reading: string

	/** Tags for the term definitions. */
	definition_tags: string[]

	/**
	 * Rules that affect the entry inflections. Those are also tags.
	 *
	 * One of `adj-i`, `v1`, `v5`, `vk`, `vs`.
	 *
	 * - `adj-i` adjective (keiyoushi)
	 * - `v1`    Ichidan verb
	 * - `v5`    Godan verb
	 * - `vk`    Kuru verb - special class (e.g. `いって来る`, `來る`)
	 * - `vs`    noun or participle which takes the aux. verb suru
	 */
	rules: string[]

	/** Score for this entry. Higher values have precedence. */
	score: number

	/** Definition for this entry. */
	glossary: string[]

	/** Sequence number for this entry in the dictionary. */
	sequence: number

	/** Tags for the main term. */
	term_tags: string[]
}

/**
 * Kanji from an imported dictionary.
 */
export type Kanji = {
	/** Kanji character. */
	character: string

	/** Onyomi (chinese) readings for the Kanji. */
	onyomi: string[]

	/** Kunyomi (japanese) readings for the Kanji. */
	kunyomi: string[]

	/** Tags for the Kanji. */
	tags: string[]

	/** Meanings for the kanji. */
	meanings: string[]

	/**
	 * Additional kanji information. The keys in `stats` are further detailed
	 * by the dictionary tags.
	 */
	stats: { [key: string]: string }
}

/**
 * Tag for a kanji or term. For kanji those are also used to describe
 * the `stats` keys.
 */
export type Tag = {
	/** Name to reference this tag by. */
	name: string

	/** Category for this tag. This can be used to group related tags. */
	category: string

	/**
	 * Sort order for this tag (lesser scores come first). This has higher
	 * priority than the name.
	 */
	order: number

	/** Description for this tag. */
	description: string

	/** Score for entries tagged with this (?). */
	score: number
}

/** Frequency metadata for kanji or terms. */
export type Meta = {
	/** Kanji or term. */
	expression: string

	/** Always `"freq"`. */
	mode: string

	/** Metadata value. */
	data: number
}

export async function importSource(source: Source) {
	const INDEX_NAME = 'index.json'
	const FORMAT = 3

	const err = (message: string) => new Error(`importing ${source.name}: ${message}`)

	if (!source.list[INDEX_NAME]) {
		throw err(`invalid file (missing index.json)`)
	}

	const index = JSON.parse(await source.file(INDEX_NAME)) as Index
	if (index.format !== FORMAT) {
		throw err(`invalid format number (expected ${FORMAT}, got ${index.format})`)
	}

	const dict: Dictionary = {
		index: index,
		terms: [],
		kanji: [],
		tags: [],
		terms_meta: [],
		kanji_meta: [],
	}

	// Split the file name into the main name (which is used to identify its
	// type) and the number.
	//
	// This are the formats recognized:
	// - Frequency data (e.g. innocent_corpus.zip)
	//   - term_meta_bank, kanji_meta_bank
	// - Term dictionary (e.g. jmdict_english.zip)
	//   - term_bank, tag_bank
	// - Kanji dictionary (e.g. kanjidic_english.zip)
	//   - kanji_bank, tag_bank
	const splitName = (name: string) => {
		const m = name.match(/^(term|kanji|tag|term_meta|kanji_meta)_bank_(\d+)\.json$/)
		return m && m.length ? { kind: m[1], file: name, index: parseInt(m[2], 10) } : undefined
	}

	const files = Object.keys(source.list)
		.map(splitName)
		.filter((x): x is Exclude<ReturnType<typeof splitName>, undefined> => x !== undefined)
		.sort((a, b) => (a.kind !== b.kind ? a.kind.localeCompare(b.kind) : a.index - b.index))

	const csv = (input: string) => input.split(' ').filter((x) => !!x)

	for (const it of files) {
		const read = async () => JSON.parse(await source.file(it.file)) as unknown[][]
		switch (it.kind) {
			case 'term':
				for (const row of await read()) {
					const [expression, reading, definition_tags, rules, score, glossary, sequence, term_tags] = row
					dict.terms.push({
						expression: expression as string,
						reading: reading as string,
						definition_tags: csv(definition_tags as string),
						rules: csv(rules as string),
						score: score as number,
						glossary: glossary as string[],
						sequence: sequence as number,
						term_tags: csv(term_tags as string),
					})
				}
				break

			case 'kanji':
				for (const row of await read()) {
					const [character, onyomi, kunyomi, tags, meanings, stats] = row
					dict.kanji.push({
						character: character as string,
						onyomi: csv(onyomi as string),
						kunyomi: csv(kunyomi as string),
						tags: csv(tags as string),
						meanings: meanings as string[],
						stats: stats as { [key: string]: string },
					})
				}
				break

			case 'tag':
				for (const row of await read()) {
					const [name, category, order, notes, score] = row
					dict.tags.push({
						name: name as string,
						category: category as string,
						order: order as number,
						description: notes as string,
						score: score as number,
					})
				}
				break

			case 'kanji_meta':
			case 'term_meta':
				{
					const ls = it.kind === 'kanji_meta' ? dict.kanji_meta : dict.terms_meta
					for (const row of await read()) {
						const [expression, mode, data] = row
						ls.push({
							expression: expression as string,
							mode: mode as string,
							data: data as number,
						})
					}
				}
				break
		}
	}

	dict.tags.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name)))
	return dict
}

export function dictionaryInfo(dict: Dictionary, args = optional({ short: false, indent: '' })) {
	const { short, indent } = args || {}
	if (short) {
		const output: string[] = []
		dict.terms.length && output.push(`${dict.terms.length} terms`)
		dict.kanji.length && output.push(`${dict.kanji.length} kanji`)
		dict.terms_meta.length && output.push(`${dict.terms_meta.length} terms frequency`)
		dict.kanji_meta.length && output.push(`${dict.kanji_meta.length} kanji frequency`)
		dict.tags.length && output.push(`${dict.tags.length} tags`)
		return `${dict.index.title} with ${output.join(' and ')}`
	}

	const lines: string[] = []

	lines.push(`${dict.index.title} (format: ${dict.index.format}, revision: ${dict.index.revision}) {`)
	lines.push(`    List = ${dict.terms.length} terms / ${dict.kanji.length} kanji`)
	lines.push(`    Meta = ${dict.terms_meta.length} terms / ${dict.kanji_meta.length} kanji`)
	lines.push(`    Tags = ${dict.tags.length}`)

	if (dict.kanji.length) {
		const stats: { [key: string]: boolean } = {}
		for (const kanji of dict.kanji) {
			for (const key of Object.keys(kanji.stats)) {
				stats[key] = true
			}
		}
		lines.push(``, `    Stats = ${Object.keys(stats).sort().join(',')}`)
	}

	if (dict.terms.length) {
		const termMap: { [key: string]: boolean } = {}
		const ruleMap: { [key: string]: boolean } = {}
		const definitionMap: { [key: string]: boolean } = {}
		for (const term of dict.terms) {
			for (const key of term.term_tags) {
				termMap[key] = true
			}
			for (const key of term.rules) {
				ruleMap[key] = true
			}
			for (const key of term.definition_tags) {
				definitionMap[key] = true
			}
		}

		const terms = Object.keys(termMap).sort().join(' ')
		const rules = Object.keys(ruleMap).sort().join(' ')
		const definitions = Object.keys(definitionMap).sort().join(' ')

		if (rules.length) {
			lines.push(``, `    Rules = ${rules}`)
		}
		if (terms.length) {
			lines.push(``, `    Term Tags = ${terms}`)
		}
		if (definitions.length) {
			lines.push(``, `    Definition Tags = ${definitions}`)
		}
	}

	if (dict.tags.length) {
		lines.push(``, `    All tags {`)
		for (const tag of dict.tags) {
			const category = tag.category ? ` (${tag.category})` : ``
			lines.push(
				`        - ${tag.name}${category}: ${tag.description} [score: ${tag.score}, order: ${tag.order}]`,
			)
		}
		lines.push(`    }`)
	}

	lines.push(`}`)

	return (indent ? lines.map((x) => (x ? indent + x : x)) : lines).join('\n')
}
