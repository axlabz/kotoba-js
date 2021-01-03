type Callback<E, A> = (err: E, args: A) => void

export function promisify<T, E, A>(fn: (args: T, cb: Callback<E, A>) => void) {
	return (args: T) =>
		new Promise<A>((resolve, reject) => {
			fn(args, (err, res) => {
				err ? reject(err) : resolve(res)
			})
		})
}
