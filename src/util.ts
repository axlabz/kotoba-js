type Callback<E, A> = (err: E, args: A) => void

/**
 * Transform a node callback style function in a promise.
 */
export function promisify<T, E, A>(fn: (args: T, cb: Callback<E, A>) => void) {
	return (args: T) =>
		new Promise<A>((resolve, reject) => {
			fn(args, (err, res) => {
				err ? reject(err) : resolve(res)
			})
		})
}

/**
 * Transform the type of the argument into a type where all keys are optional.
 *
 * For use when defining functions with object default arguments.
 */
export function optional<T>(args: T): { [k in keyof T]?: T[k] } {
	return args
}

/**
 * Use an argument to temporarily silence lint errors.
 */
export function use<T>(arg: T) {
	return arg
}
