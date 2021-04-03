import { createHash } from "crypto"

//https://github.com/bevry/sortobject
/**
 * Returns a copy of the passed array, with all nested objects within it sorted deeply by their keys, without mangling any nested arrays.
 * @param subject The unsorted array.
 * @param comparator An optional comparator for sorting keys of objects.
 * @returns The new sorted array.
 */
function sortArray<T extends any[]>(subject: T, comparator?: (a: string, b: string) => number): T {
  const result = []
  for (let value of subject) {
    // Recurse if object or array
    if (value != null) {
      if (Array.isArray(value)) {
        value = sortArray(value, comparator)
      } else if (typeof value === "object") {
        /* eslint no-use-before-define:0 */
        value = sortObject(value, comparator)
      }
    }

    // Push
    result.push(value)
  }
  return result as T
}

/**
 * Returns a copy of the passed object, with all nested objects within it sorted deeply by their keys,
 * without mangling any nested arrays inside of it.
 * @param subject The unsorted object.
 * @param comparator An optional comparator for sorting keys of objects.
 * @returns The new sorted object.
 */
function sortObject<T extends { [key: string]: any }>(subject: T, comparator?: (a: string, b: string) => number): T {
  const result: { [key: string]: any } = {} as T
  const sortedKeys = Object.keys(subject).sort(comparator)
  for (let i = 0; i < sortedKeys.length; ++i) {
    // Fetch
    const key = sortedKeys[i]
    let value = subject[key]

    // Recurse if object or array
    if (value != null) {
      if (Array.isArray(value)) {
        value = sortArray(value, comparator)
      } else if (typeof value === "object") {
        value = sortObject(value, comparator)
      }
    }

    // Push
    result[key] = value
  }
  return result as T
}

/** @example
 var equal = require('assert').strictEqual
equal(hash([1,{ a: 1, b: 2, c: 3 }, 2, 3]), hash([3, 2, 1, { c: 3, b: 2, a: 1 }]))
equal(hash([1, 2, 3]), hash([3, 2, 1]))
equal(hash({a:1,b:2,c:3}), hash({c:3,b:2,a:1}))
equal(hash({a:1,b:2,c:3}), hash({c:3,b:2,a:1}))
equal(hash({a:1,b:[2,3],c:4}), hash({c:4,b:[2,3],a:1}))
equal(hash({a:1,b:[2,{c:3,d:4}],e:5}), hash({e:5,b:[2,{d:4,c:3}],a:1}))
*/
function shasum(str: string | any[] | Buffer | object) {
  str =
    "string" === typeof str
      ? str
      : Buffer.isBuffer(str)
      ? str
      : JSON.stringify(sortObject(Array.isArray(str) ? str.sort() : str))

  return createHash("sha1")
    .update(str as any, Buffer.isBuffer(str) ? null : "utf8")
    .digest("hex")
}

export { shasum }
