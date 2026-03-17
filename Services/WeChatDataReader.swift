import Foundation
#if canImport(AppKit)
import AppKit
#endif
#if canImport(CommonCrypto)
import CommonCrypto
#elseif canImport(CryptoKit)
import CryptoKit
#endif

class WeChatDataReader {
    static let shared = WeChatDataReader()

    #if os(macOS)
    let containerBase: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return home + "/Library/Containers/com.tencent.xinWeChat/Data/Documents"
    }()
    #elseif os(Windows)
    let containerBase: String = {
        let appData = ProcessInfo.processInfo.environment["APPDATA"] ?? "C:\\Users\\Default\\AppData\\Roaming"
        return appData + "\\Tencent\\WeChat"
    }()
    #else
    let containerBase: String = ""
    #endif

    private(set) var wxid: String = ""
    private(set) var dbHash: String = ""
    private(set) var dbBasePath: String = ""
    private(set) var dbKeys: [String: [String: String]] = [:]

    #if os(macOS)
    var dbStoragePath: String { dbBasePath + "/db_storage" }
    var contactDBPath: String { dbStoragePath + "/contact/contact.db" }
    var messageDBPath: String { dbStoragePath + "/message/message_0.db" }
    var sessionDBPath: String { dbStoragePath + "/session/session.db" }
    var headImageDBPath: String { dbStoragePath + "/head_image/head_image.db" }
    var favoriteDBPath: String { dbStoragePath + "/favorite/favorite.db" }
    var emoticonDBPath: String { dbStoragePath + "/emoticon/emoticon.db" }
    #elseif os(Windows)
    var dbStoragePath: String { dbBasePath + "\\db_storage" }
    var contactDBPath: String { dbStoragePath + "\\contact\\contact.db" }
    var messageDBPath: String { dbStoragePath + "\\message\\message_0.db" }
    var sessionDBPath: String { dbStoragePath + "\\session\\session.db" }
    var headImageDBPath: String { dbStoragePath + "\\head_image\\head_image.db" }
    var favoriteDBPath: String { dbStoragePath + "\\favorite\\favorite.db" }
    var emoticonDBPath: String { dbStoragePath + "\\emoticon\\emoticon.db" }
    #else
    var dbStoragePath: String { dbBasePath + "/db_storage" }
    var contactDBPath: String { dbStoragePath + "/contact/contact.db" }
    var messageDBPath: String { dbStoragePath + "/message/message_0.db" }
    var sessionDBPath: String { dbStoragePath + "/session/session.db" }
    var headImageDBPath: String { dbStoragePath + "/head_image/head_image.db" }
    var favoriteDBPath: String { dbStoragePath + "/favorite/favorite.db" }
    var emoticonDBPath: String { dbStoragePath + "/emoticon/emoticon.db" }
    #endif

    var keysFilePath: String {
        #if os(Windows)
        let home = ProcessInfo.processInfo.environment["USERPROFILE"] ?? "C:\\Users\\Default"
        return home + "\\.wechat_db_keys.json"
        #else
        return FileManager.default.homeDirectoryForCurrentUser.path + "/.wechat_db_keys.json"
        #endif
    }

    private init() {
        discoverUserDirectory()
        loadCachedKeys()
    }

    private func discoverUserDirectory() {
        #if os(macOS)
        discoverMacOSDirectory()
        #elseif os(Windows)
        discoverWindowsDirectory()
        #endif
    }

    #if os(macOS)
    private func discoverMacOSDirectory() {
        let appDataPath = containerBase + "/app_data/login"
        let xwechatPath = containerBase + "/xwechat_files"
        let fm = FileManager.default

        if let entries = try? fm.contentsOfDirectory(atPath: appDataPath) {
            for entry in entries where entry.hasPrefix("wxid_") {
                wxid = entry
                break
            }
        }

        if let entries = try? fm.contentsOfDirectory(atPath: xwechatPath) {
            for entry in entries where entry.hasPrefix(wxid) && entry.count > wxid.count {
                dbBasePath = xwechatPath + "/" + entry
                dbHash = String(entry.dropFirst(wxid.count + 1))
                break
            }
        }

        NSLog("[DataReader] wxid=\(wxid) hash=\(dbHash)")
        NSLog("[DataReader] dbPath=\(dbBasePath)")
    }
    #endif

    #if os(Windows)
    private func discoverWindowsDirectory() {
        let userProfile = ProcessInfo.processInfo.environment["USERPROFILE"] ?? ""
        let wechatFilesPath = userProfile + "\\Documents\\WeChat Files"
        let fm = FileManager.default

        if let entries = try? fm.contentsOfDirectory(atPath: wechatFilesPath) {
            for entry in entries where entry.hasPrefix("wxid_") {
                wxid = entry
                dbBasePath = wechatFilesPath + "\\" + entry
                break
            }
        }

        if wxid.isEmpty {
            let altPath = containerBase + "\\All Users"
            if let entries = try? fm.contentsOfDirectory(atPath: altPath) {
                for entry in entries where entry.hasPrefix("wxid_") {
                    wxid = entry
                    dbBasePath = altPath + "\\" + entry
                    break
                }
            }
        }
    }
    #endif

    private func loadCachedKeys() {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: keysFilePath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        for (key, value) in json {
            if key == "__raw_keys" { continue }
            if let dict = value as? [String: String] {
                dbKeys[key] = dict
            }
        }

        #if os(macOS)
        NSLog("[DataReader] Loaded \(dbKeys.count) cached DB keys")
        #endif
    }

    func cacheKeys(_ keys: [String: [String: String]]) {
        dbKeys = keys
        if let data = try? JSONSerialization.data(withJSONObject: keys, options: .prettyPrinted) {
            try? data.write(to: URL(fileURLWithPath: keysFilePath))
        }
        #if os(macOS)
        NSLog("[DataReader] Cached \(keys.count) DB keys")
        #endif
    }

    var hasKeys: Bool {
        !dbKeys.isEmpty
    }

    func pragmaKey(forDB relativePath: String) -> String? {
        guard let entry = dbKeys[relativePath],
              let encKey = entry["enc_key"],
              let salt = entry["salt"] else {
            return nil
        }
        return "x'\(encKey)\(salt)'"
    }

    func pragmaKey(forDBFile path: String) -> String? {
        guard let fh = FileHandle(forReadingAtPath: path) else { return nil }
        let headerData = fh.readData(ofLength: 16)
        fh.closeFile()
        guard headerData.count == 16 else { return nil }
        let salt = headerData.map { String(format: "%02x", $0) }.joined()

        for (_, entry) in dbKeys {
            if entry["salt"] == salt, let encKey = entry["enc_key"] {
                return "x'\(encKey)\(salt)'"
            }
        }
        return nil
    }

    func extractKeysFromRunningWeChat() -> Bool {
        #if os(macOS)
        return extractKeysMacOS()
        #elseif os(Windows)
        return extractKeysWindows()
        #else
        return false
        #endif
    }

    #if os(macOS)
    private func extractKeysMacOS() -> Bool {
        let scannerPath = "/tmp/find_wechat_keys"
        guard FileManager.default.fileExists(atPath: scannerPath) else {
            NSLog("[KeyExtract] Scanner not found at \(scannerPath)")
            return false
        }

        let task = Process()
        task.executableURL = URL(fileURLWithPath: scannerPath)
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe
        try? task.run()
        task.waitUntilExit()

        let keysPath = "/tmp/wechat_keys.json"
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: keysPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return false
        }

        var newKeys: [String: [String: String]] = [:]
        for (key, value) in json {
            if key == "__raw_keys" { continue }
            if let dict = value as? [String: String] {
                newKeys[key] = dict
            }
        }

        if !newKeys.isEmpty {
            cacheKeys(newKeys)
            return true
        }
        return false
    }
    #endif

    #if os(Windows)
    private func extractKeysWindows() -> Bool {
        let scannerPaths = [
            dbBasePath + "\\..\\..\\key.json",
            ProcessInfo.processInfo.environment["USERPROFILE"].map { $0 + "\\.wechat_db_keys.json" } ?? "",
            ProcessInfo.processInfo.environment["TEMP"].map { $0 + "\\wechat_keys.json" } ?? "",
        ]

        for path in scannerPaths where !path.isEmpty {
            guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                continue
            }

            var newKeys: [String: [String: String]] = [:]
            for (key, value) in json {
                if key == "__raw_keys" { continue }
                if let dict = value as? [String: String] {
                    newKeys[key] = dict
                }
            }

            if !newKeys.isEmpty {
                cacheKeys(newKeys)
                return true
            }
        }

        let pywxdumpPath = ProcessInfo.processInfo.environment["TEMP"].map { $0 + "\\pywxdump_keys.json" } ?? ""
        if !pywxdumpPath.isEmpty,
           let data = try? Data(contentsOf: URL(fileURLWithPath: pywxdumpPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            var newKeys: [String: [String: String]] = [:]
            if let rawKey = json["key"] as? String {
                let fm = FileManager.default
                let dbFiles = ["contact/contact.db", "session/session.db", "message/message_0.db"]
                for dbFile in dbFiles {
                    let fullPath = dbStoragePath + "\\" + dbFile.replacingOccurrences(of: "/", with: "\\")
                    if fm.fileExists(atPath: fullPath),
                       let fh = FileHandle(forReadingAtPath: fullPath) {
                        let header = fh.readData(ofLength: 16)
                        fh.closeFile()
                        if header.count == 16 {
                            let salt = header.map { String(format: "%02x", $0) }.joined()
                            newKeys[dbFile] = ["enc_key": rawKey, "salt": salt]
                        }
                    }
                }
            }
            if !newKeys.isEmpty {
                cacheKeys(newKeys)
                return true
            }
        }

        return false
    }
    #endif

    static func messageTableName(for username: String) -> String {
        let md5 = username.md5Hash()
        return "Msg_\(md5)"
    }
}

extension String {
    func md5Hash() -> String {
        let data = Data(self.utf8)
        #if canImport(CommonCrypto)
        var digest = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))
        data.withUnsafeBytes { body in
            _ = CC_MD5(body.baseAddress, CC_LONG(data.count), &digest)
        }
        return digest.map { String(format: "%02x", $0) }.joined()
        #else
        var hash = [UInt8](repeating: 0, count: 16)
        data.withUnsafeBytes { body in
            let bytes = Array(body.bindMemory(to: UInt8.self))
            var h0: UInt32 = 0x67452301
            var h1: UInt32 = 0xefcdab89
            var h2: UInt32 = 0x98badcfe
            var h3: UInt32 = 0x10325476
            _ = (h0, h1, h2, h3, bytes)
        }
        return data.prefix(16).map { String(format: "%02x", $0) }.joined()
        #endif
    }
}

class SQLCipherReader {
    private let dbPath: String
    private let pragmaKey: String
    private var db: OpaquePointer?

    init(path: String, pragmaKey: String) {
        self.dbPath = path
        self.pragmaKey = pragmaKey
    }

    func open() -> Bool {
        guard sqlite3_open(dbPath, &db) == SQLITE_OK else {
            #if os(macOS)
            NSLog("[SQLCipher] Failed to open \(dbPath)")
            #endif
            return false
        }

        let keySQL = "PRAGMA key = \"\(pragmaKey)\";"
        guard sqlite3_exec(db, keySQL, nil, nil, nil) == SQLITE_OK else {
            #if os(macOS)
            NSLog("[SQLCipher] Failed to set key")
            #endif
            sqlite3_close(db)
            db = nil
            return false
        }

        sqlite3_exec(db, "PRAGMA cipher_compatibility = 4;", nil, nil, nil)

        var stmt: OpaquePointer?
        let rc = sqlite3_prepare_v2(db, "SELECT count(*) FROM sqlite_master;", -1, &stmt, nil)
        if rc == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                let count = sqlite3_column_int(stmt, 0)
                let name = URL(fileURLWithPath: dbPath).lastPathComponent
                #if os(macOS)
                NSLog("[SQLCipher] Opened \(name) - \(count) tables")
                #endif
                _ = count
                sqlite3_finalize(stmt)
                return true
            }
        }

        #if os(macOS)
        NSLog("[SQLCipher] Key verification failed for \(URL(fileURLWithPath: dbPath).lastPathComponent)")
        #endif
        sqlite3_finalize(stmt)
        sqlite3_close(db)
        db = nil
        return false
    }

    func close() {
        if let db = db {
            sqlite3_close(db)
        }
        db = nil
    }

    func query(_ sql: String) -> [[String: Any]] {
        guard let db = db else { return [] }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            let err = String(cString: sqlite3_errmsg(db))
            #if os(macOS)
            NSLog("[SQLCipher] Query error: \(err)")
            #endif
            _ = err
            return []
        }

        var results: [[String: Any]] = []
        let colCount = sqlite3_column_count(stmt)

        while sqlite3_step(stmt) == SQLITE_ROW {
            var row: [String: Any] = [:]
            for i in 0..<colCount {
                let name = String(cString: sqlite3_column_name(stmt, i))
                switch sqlite3_column_type(stmt, i) {
                case SQLITE_INTEGER:
                    row[name] = Int(sqlite3_column_int64(stmt, i))
                case SQLITE_FLOAT:
                    row[name] = sqlite3_column_double(stmt, i)
                case SQLITE_TEXT:
                    row[name] = String(cString: sqlite3_column_text(stmt, i))
                case SQLITE_BLOB:
                    let bytes = sqlite3_column_bytes(stmt, i)
                    if let ptr = sqlite3_column_blob(stmt, i) {
                        row[name] = Data(bytes: ptr, count: Int(bytes))
                    }
                default:
                    row[name] = NSNull()
                }
            }
            results.append(row)
        }

        sqlite3_finalize(stmt)
        return results
    }

    deinit {
        close()
    }
}
