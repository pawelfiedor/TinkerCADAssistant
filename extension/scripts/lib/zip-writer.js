class SimpleZipWriter {
    constructor() {
        this.files = []
    }

    addFile(name, data) {
        this.files.push({ name, data })
    }

    generate() {
        const crc32Table = new Int32Array(256)
        for (let i = 0; i < 256; i++) {
            let c = i
            for (let j = 0; j < 8; j++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1))
            }
            crc32Table[i] = c
        }

        const getCrc32 = (buf) => {
            let crc = -1
            for (let i = 0; i < buf.length; i++) {
                crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xFF]
            }
            return (crc ^ -1) >>> 0
        }

        const getDosDateTime = (date) => {
            const y = date.getFullYear()
            const m = date.getMonth() + 1
            const d = date.getDate()
            const h = date.getHours()
            const min = date.getMinutes()
            const s = date.getSeconds()
            const dosTime = (h << 11) | (min << 5) | (s >> 1)
            const dosDate = ((y - 1980) << 9) | (m << 5) | d
            return { dosTime, dosDate }
        }

        const { dosTime, dosDate } = getDosDateTime(new Date())
        const textEncoder = new TextEncoder()
        const getBytes = (str) => textEncoder.encode(str)

        let localHeadersSize = 0
        let centralDirectorySize = 0

        this.files.forEach(f => {
            const nameBytes = getBytes(f.name)
            f.nameBytes = nameBytes
            f.crc = getCrc32(f.data)
            f.localHeaderOffset = localHeadersSize

            localHeadersSize += 30 + nameBytes.length + f.data.length
            centralDirectorySize += 46 + nameBytes.length
        })

        const totalSize = localHeadersSize + centralDirectorySize + 22
        const out = new Uint8Array(totalSize)
        let pos = 0

        const writeUint16 = (val) => {
            out[pos++] = val & 0xFF
            out[pos++] = (val >> 8) & 0xFF
        }

        const writeUint32 = (val) => {
            out[pos++] = val & 0xFF
            out[pos++] = (val >> 8) & 0xFF
            out[pos++] = (val >> 16) & 0xFF
            out[pos++] = (val >> 24) & 0xFF
        }

        const writeBytes = (bytes) => {
            out.set(bytes, pos)
            pos += bytes.length
        }

        this.files.forEach(f => {
            writeUint32(0x04034b50)
            writeUint16(10)
            writeUint16(0)
            writeUint16(0)
            writeUint16(dosTime)
            writeUint16(dosDate)
            writeUint32(f.crc)
            writeUint32(f.data.length)
            writeUint32(f.data.length)
            writeUint16(f.nameBytes.length)
            writeUint16(0)
            writeBytes(f.nameBytes)
            writeBytes(f.data)
        })

        const centralDirectoryOffset = pos

        this.files.forEach(f => {
            writeUint32(0x02014b50)
            writeUint16(20)
            writeUint16(10)
            writeUint16(0)
            writeUint16(0)
            writeUint16(dosTime)
            writeUint16(dosDate)
            writeUint32(f.crc)
            writeUint32(f.data.length)
            writeUint32(f.data.length)
            writeUint16(f.nameBytes.length)
            writeUint16(0)
            writeUint16(0)
            writeUint16(0)
            writeUint16(0)
            writeUint32(0)
            writeUint32(f.localHeaderOffset)
            writeBytes(f.nameBytes)
        })

        writeUint32(0x06054b50)
        writeUint16(0)
        writeUint16(0)
        writeUint16(this.files.length)
        writeUint16(this.files.length)
        writeUint32(centralDirectorySize)
        writeUint32(centralDirectoryOffset)
        writeUint16(0)

        return out
    }
}

if (typeof window !== 'undefined') {
    window.SimpleZipWriter = SimpleZipWriter;
}
