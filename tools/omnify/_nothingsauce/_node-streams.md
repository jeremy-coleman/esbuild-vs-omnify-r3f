
```ts
import {
    Readable,
    Writable,
    Duplex,
    Transform,
    PassThrough,
    pipeline,
    finished,
    Stream,
    //addAbortSignal,
    //promises,
    //_isUint8Array,
    //_uint8ArrayToBuffer

} from 'stream'

import {
finished as finishedAsync,
pipeline as pipelineAsync
} from 'stream/promises'

```

object keys of require('stream')
//stream 
// [
//     'Readable',
//     'Writable',
//     'Duplex',
//     'Transform',
//     'PassThrough',
//     'pipeline',
//     'addAbortSignal',
//     'finished',
//     'promises',
//     'Stream',
//     '_isUint8Array',
//     '_uint8ArrayToBuffer'
//   ]

object keys of require('stream/promises')
//stream/promises
//[ 'finished', 'pipeline' ];
