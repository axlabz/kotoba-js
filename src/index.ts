export function say_hello() {
	console.log('こんにちは！コトバです！！！')
}

if (require.main === module && typeof window === 'undefined') {
	say_hello()
}
