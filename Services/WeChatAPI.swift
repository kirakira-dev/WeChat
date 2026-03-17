import Foundation
import AppKit

class WeChatAPI: ObservableObject {
    static let shared = WeChatAPI()

    private let appID = "wx782c26e4c19acffb"
    private let uosAppID = "wx782c26e4c19acffb"

    private var baseURL = "https://wx2.qq.com"
    private var loginBaseURL = "https://login.wx2.qq.com"
    private var fileBaseURL = "https://file.wx2.qq.com"
    private var pushBaseURL = "https://webpush.wx2.qq.com"

    @Published var uuid: String = ""
    @Published var qrCodeData: Data?
    @Published var loginState: LoginState = .idle
    @Published var userInfo: WXContact?

    private var skey: String = ""
    private var sid: String = ""
    private var uin: String = ""
    private var passTicket: String = ""
    private var deviceID: String = ""
    private var syncKey: [String: Any] = [:]
    private var syncKeyFormatted: String = ""
    private var selfUserName: String = ""

    private var syncCheckSeq: Int = 0
    private var session: URLSession
    private var isSyncing = false

    var onNewMessages: (([WXMessage]) -> Void)?
    var onContactUpdate: (([WXContact]) -> Void)?

    enum LoginState: Equatable {
        case idle
        case waitingScan
        case scanned
        case loggedIn
        case failed(String)
    }

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 35
        self.session = URLSession(configuration: config)
        self.deviceID = "e\(String(format: "%015d", Int.random(in: 100000000000000...999999999999999)))"
    }

    func getUUID() async throws -> String {
        let url = "\(loginBaseURL)/jslogin?appid=\(appID)&redirect_uri=https%3A%2F%2Fwx2.qq.com%2Fcgi-bin%2Fmmwebwx-bin%2Fwebwxnewloginpage%3Fmod%3Ddesktop&fun=new&lang=en_US&_=\(timestamp())"

        let data = try await httpGet(url)
        guard let body = String(data: data, encoding: .utf8) else {
            throw WXError.invalidResponse
        }

        guard body.contains("200"),
              let uuidMatch = body.range(of: "\"([^\"]+)\"", options: String.CompareOptions.regularExpression) else {
            throw WXError.loginFailed("Failed to get UUID")
        }

        let extracted = String(body[uuidMatch]).replacingOccurrences(of: "\"", with: "")
        self.uuid = extracted

        await MainActor.run {
            self.loginState = .waitingScan
        }

        return extracted
    }

    func getQRCode() async throws -> Data {
        let url = "\(loginBaseURL)/qrcode/\(uuid)"
        let data = try await httpGet(url)
        await MainActor.run {
            self.qrCodeData = data
        }
        return data
    }

    func pollForLogin() async throws -> (Bool, String?) {
        let tip: String
        if case .waitingScan = loginState { tip = "1" } else { tip = "0" }
        let url = "\(loginBaseURL)/cgi-bin/mmwebwx-bin/login?loginicon=true&uuid=\(uuid)&tip=\(tip)&r=\(~timestamp())&_=\(timestamp())"

        let data = try await httpGet(url)
        guard let body = String(data: data, encoding: .utf8) else {
            throw WXError.invalidResponse
        }

        if body.contains("window.code=200") {
            if let range = body.range(of: "redirect_uri=\"([^\"]+)\"", options: String.CompareOptions.regularExpression) {
                var redirectURL = String(body[range])
                    .replacingOccurrences(of: "redirect_uri=\"", with: "")
                    .replacingOccurrences(of: "\"", with: "")

                if let urlObj = URL(string: redirectURL) {
                    let host = urlObj.host ?? ""
                    if host.contains("wx2.qq.com") {
                        baseURL = "https://wx2.qq.com"
                        fileBaseURL = "https://file.wx2.qq.com"
                        pushBaseURL = "https://webpush.wx2.qq.com"
                    } else if host.contains("wx.qq.com") {
                        baseURL = "https://wx.qq.com"
                        fileBaseURL = "https://file.wx.qq.com"
                        pushBaseURL = "https://webpush.wx.qq.com"
                    } else {
                        let baseDomain = host.replacingOccurrences(of: "wx", with: "")
                        baseURL = "https://wx\(baseDomain)"
                        fileBaseURL = "https://file.wx\(baseDomain)"
                        pushBaseURL = "https://webpush.wx\(baseDomain)"
                    }
                    loginBaseURL = "https://login.\(urlObj.host ?? "wx2.qq.com")"
                }

                if !redirectURL.contains("fun=") {
                    redirectURL += "&fun=new&version=v2"
                }

                await MainActor.run {
                    self.loginState = .loggedIn
                }
                return (true, redirectURL)
            }
        } else if body.contains("window.code=201") {
            await MainActor.run {
                self.loginState = .scanned
            }

            if let range = body.range(of: "userAvatar = '([^']+)'", options: String.CompareOptions.regularExpression) {
                let _ = String(body[range])
            }
            return (false, nil)
        } else if body.contains("window.code=408") {
            return (false, nil)
        }

        return (false, nil)
    }

    func completeLogin(redirectURL: String) async throws {
        var request = URLRequest(url: URL(string: redirectURL)!)
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
        request.setValue("https://wx2.qq.com", forHTTPHeaderField: "Referer")
        request.setValue("2.0.0", forHTTPHeaderField: "client-version")
        request.setValue(uosExtSpam(), forHTTPHeaderField: "extspam")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw WXError.loginFailed("Login redirect failed")
        }

        guard let xml = String(data: data, encoding: .utf8) else {
            throw WXError.invalidResponse
        }

        skey = extractXMLValue(xml, tag: "skey")
        sid = extractXMLValue(xml, tag: "wxsid")
        uin = extractXMLValue(xml, tag: "wxuin")
        passTicket = extractXMLValue(xml, tag: "pass_ticket")

        if skey.isEmpty || sid.isEmpty || uin.isEmpty {
            throw WXError.loginFailed("Failed to extract session credentials")
        }

        NSLog("[WeChatAPI] Login successful: uin=\(uin), sid=\(sid)")
    }

    func webwxInit() async throws -> [WXMessage] {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxinit?r=\(~timestamp())&pass_ticket=\(passTicket)"

        let body: [String: Any] = [
            "BaseRequest": baseRequest()
        ]

        let data = try await httpPost(url, json: body)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw WXError.invalidResponse
        }

        if let user = json["User"] as? [String: Any] {
            selfUserName = user["UserName"] as? String ?? ""
            let contact = WXContact.fromWebDict(user)
            await MainActor.run {
                self.userInfo = contact
            }
        }

        if let sk = json["SyncKey"] as? [String: Any] {
            syncKey = sk
            formatSyncKey()
        }

        var messages: [WXMessage] = []
        if let msgList = json["AddMsgList"] as? [[String: Any]] {
            messages = msgList.map { WXMessage.fromWebDict($0, selfUserName: selfUserName) }
        }

        try await webwxStatusNotify()

        return messages
    }

    func getContactList() async throws -> [WXContact] {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxgetcontact?r=\(timestamp())&seq=0&skey=\(skey.urlEncoded)&pass_ticket=\(passTicket)"

        let data = try await httpGet(url)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let memberList = json["MemberList"] as? [[String: Any]] else {
            throw WXError.invalidResponse
        }

        let contacts = memberList.map { WXContact.fromWebDict($0) }
            .filter { !$0.isSpecial }

        return contacts
    }

    func getBatchContact(userNames: [String]) async throws -> [WXContact] {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxbatchgetcontact?type=ex&r=\(timestamp())&pass_ticket=\(passTicket)"

        let list = userNames.map { ["UserName": $0, "ChatRoomId": ""] }
        let body: [String: Any] = [
            "BaseRequest": baseRequest(),
            "Count": userNames.count,
            "List": list
        ]

        let data = try await httpPost(url, json: body)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contactList = json["ContactList"] as? [[String: Any]] else {
            throw WXError.invalidResponse
        }

        return contactList.map { WXContact.fromWebDict($0) }
    }

    func sendTextMessage(to userName: String, content: String) async throws -> String {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxsendmsg?pass_ticket=\(passTicket)"
        let msgID = "\(timestamp())\(String(format: "%04d", Int.random(in: 1000...9999)))"

        let body: [String: Any] = [
            "BaseRequest": baseRequest(),
            "Msg": [
                "Type": 1,
                "Content": content,
                "FromUserName": selfUserName,
                "ToUserName": userName,
                "LocalID": msgID,
                "ClientMsgId": msgID
            ] as [String: Any],
            "Scene": 0
        ]

        let data = try await httpPost(url, json: body)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let baseResp = json["BaseResponse"] as? [String: Any],
              let ret = baseResp["Ret"] as? Int, ret == 0 else {
            throw WXError.sendFailed
        }

        return json["MsgID"] as? String ?? msgID
    }

    func sendImageMessage(to userName: String, imageData: Data, filename: String) async throws -> String {
        let mediaID = try await uploadMedia(data: imageData, filename: filename, mimeType: "image/png", toUser: userName)

        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxsendmsgimg?fun=async&f=json&pass_ticket=\(passTicket)"
        let msgID = "\(timestamp())\(String(format: "%04d", Int.random(in: 1000...9999)))"

        let body: [String: Any] = [
            "BaseRequest": baseRequest(),
            "Msg": [
                "Type": 3,
                "MediaId": mediaID,
                "FromUserName": selfUserName,
                "ToUserName": userName,
                "LocalID": msgID,
                "ClientMsgId": msgID
            ] as [String: Any],
            "Scene": 0
        ]

        let data = try await httpPost(url, json: body)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let baseResp = json["BaseResponse"] as? [String: Any],
              let ret = baseResp["Ret"] as? Int, ret == 0 else {
            throw WXError.sendFailed
        }

        return json["MsgID"] as? String ?? msgID
    }

    func sendFileMessage(to userName: String, fileData: Data, filename: String) async throws -> String {
        let mediaID = try await uploadMedia(data: fileData, filename: filename, mimeType: "application/octet-stream", toUser: userName)

        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxsendappmsg?fun=async&f=json&pass_ticket=\(passTicket)"
        let msgID = "\(timestamp())\(String(format: "%04d", Int.random(in: 1000...9999)))"

        let fileExt = (filename as NSString).pathExtension
        let content = """
        <appmsg appid='wxeb7ec651dd0aefa9' sdkver=''><title>\(filename)</title><des></des><action></action><type>6</type><content></content><url></url><lowurl></lowurl><appattach><totallen>\(fileData.count)</totallen><attachid>\(mediaID)</attachid><fileext>\(fileExt)</fileext></appattach><extinfo></extinfo></appmsg>
        """

        let body: [String: Any] = [
            "BaseRequest": baseRequest(),
            "Msg": [
                "Type": 6,
                "Content": content,
                "FromUserName": selfUserName,
                "ToUserName": userName,
                "LocalID": msgID,
                "ClientMsgId": msgID
            ] as [String: Any],
            "Scene": 0
        ]

        let data = try await httpPost(url, json: body)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let baseResp = json["BaseResponse"] as? [String: Any],
              let ret = baseResp["Ret"] as? Int, ret == 0 else {
            throw WXError.sendFailed
        }

        return json["MsgID"] as? String ?? msgID
    }

    func getMessageImage(msgID: String) async throws -> Data {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxgetmsgimg?MsgID=\(msgID)&skey=\(skey.urlEncoded)&type=big"
        return try await httpGet(url)
    }

    func getVoice(msgID: String) async throws -> Data {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxgetvoice?msgid=\(msgID)&skey=\(skey.urlEncoded)"
        return try await httpGet(url)
    }

    func getVideo(msgID: String) async throws -> Data {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxgetvideo?msgid=\(msgID)&skey=\(skey.urlEncoded)"
        return try await httpGet(url)
    }

    func getAvatar(url avatarPath: String) async throws -> Data {
        let url = "\(baseURL)\(avatarPath)"
        return try await httpGet(url)
    }

    private func uploadMedia(data: Data, filename: String, mimeType: String, toUser: String) async throws -> String {
        let url = "\(fileBaseURL)/cgi-bin/mmwebwx-bin/webwxuploadmedia?f=json"

        let uploadMediaRequest: [String: Any] = [
            "UploadType": 2,
            "BaseRequest": baseRequest(),
            "ClientMediaId": timestamp(),
            "TotalLen": data.count,
            "StartPos": 0,
            "DataLen": data.count,
            "MediaType": 4,
            "FromUserName": selfUserName,
            "ToUserName": toUser,
            "FileMd5": data.md5String
        ]

        guard let uploadJSON = try? JSONSerialization.data(withJSONObject: uploadMediaRequest) else {
            throw WXError.invalidResponse
        }

        let boundary = "----WebKitFormBoundary\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        var body = Data()

        body.appendMultipart(boundary: boundary, name: "id", value: "WU_FILE_0")
        body.appendMultipart(boundary: boundary, name: "name", value: filename)
        body.appendMultipart(boundary: boundary, name: "type", value: mimeType)
        body.appendMultipart(boundary: boundary, name: "lastModifiedDate", value: Date().description)
        body.appendMultipart(boundary: boundary, name: "size", value: "\(data.count)")
        body.appendMultipart(boundary: boundary, name: "mediatype", value: mimeType.hasPrefix("image") ? "pic" : "doc")
        body.appendMultipart(boundary: boundary, name: "uploadmediarequest", value: String(data: uploadJSON, encoding: .utf8) ?? "")
        body.appendMultipart(boundary: boundary, name: "webwx_data_ticket",
                           value: HTTPCookieStorage.shared.cookies?.first(where: { $0.name == "webwx_data_ticket" })?.value ?? "")
        body.appendMultipart(boundary: boundary, name: "pass_ticket", value: passTicket)

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"filename\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (responseData, _) = try await session.data(for: request)
        guard let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
              let mediaID = json["MediaId"] as? String else {
            throw WXError.uploadFailed
        }

        return mediaID
    }

    func startSyncLoop() {
        guard !isSyncing else { return }
        isSyncing = true

        Task {
            while isSyncing {
                do {
                    let (retcode, selector) = try await syncCheck()

                    if retcode != "0" {
                        NSLog("[Sync] Session expired (retcode=\(retcode))")
                        isSyncing = false
                        await MainActor.run {
                            self.loginState = .failed("Session expired")
                        }
                        break
                    }

                    if selector != "0" {
                        let messages = try await webwxSync()
                        if !messages.isEmpty {
                            onNewMessages?(messages)
                        }
                    }
                } catch {
                    NSLog("[Sync] Error: \(error)")
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                }
            }
        }
    }

    func stopSync() {
        isSyncing = false
    }

    private func syncCheck() async throws -> (String, String) {
        syncCheckSeq += 1
        let url = "\(pushBaseURL)/cgi-bin/mmwebwx-bin/synccheck?r=\(timestamp())&skey=\(skey.urlEncoded)&sid=\(sid.urlEncoded)&uin=\(uin)&deviceid=\(deviceID)&synckey=\(syncKeyFormatted.urlEncoded)&_=\(timestamp())"

        let data = try await httpGet(url, timeout: 30)
        guard let body = String(data: data, encoding: .utf8) else {
            throw WXError.invalidResponse
        }

        let retcode = extractJSValue(body, key: "retcode")
        let selector = extractJSValue(body, key: "selector")

        return (retcode, selector)
    }

    private func webwxSync() async throws -> [WXMessage] {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxsync?sid=\(sid.urlEncoded)&skey=\(skey.urlEncoded)&pass_ticket=\(passTicket)"

        let body: [String: Any] = [
            "BaseRequest": baseRequest(),
            "SyncKey": syncKey,
            "rr": ~timestamp()
        ]

        let data = try await httpPost(url, json: body)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw WXError.invalidResponse
        }

        if let newSK = json["SyncKey"] as? [String: Any],
           let list = newSK["List"] as? [[String: Any]], !list.isEmpty {
            syncKey = newSK
            formatSyncKey()
        } else if let newSK = json["SyncCheckKey"] as? [String: Any],
                  let list = newSK["List"] as? [[String: Any]], !list.isEmpty {
            syncKey = newSK
            formatSyncKey()
        }

        var messages: [WXMessage] = []
        if let msgList = json["AddMsgList"] as? [[String: Any]] {
            messages = msgList.compactMap { dict in
                let msg = WXMessage.fromWebDict(dict, selfUserName: selfUserName)
                if msg.msgType == .statusNotify { return nil }
                return msg
            }
        }

        if let modList = json["ModContactList"] as? [[String: Any]], !modList.isEmpty {
            let contacts = modList.map { WXContact.fromWebDict($0) }
            onContactUpdate?(contacts)
        }

        return messages
    }

    private func webwxStatusNotify() async throws {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxstatusnotify?pass_ticket=\(passTicket)"

        let body: [String: Any] = [
            "BaseRequest": baseRequest(),
            "Code": 3,
            "FromUserName": selfUserName,
            "ToUserName": selfUserName,
            "ClientMsgId": timestamp()
        ]

        let _ = try await httpPost(url, json: body)
    }

    func setRemarkName(userName: String, remark: String) async throws {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxoplog?pass_ticket=\(passTicket)"

        let body: [String: Any] = [
            "BaseRequest": baseRequest(),
            "CmdId": 2,
            "RemarkName": remark,
            "UserName": userName
        ]

        let _ = try await httpPost(url, json: body)
    }

    func pinChat(userName: String, pinned: Bool) async throws {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxoplog?pass_ticket=\(passTicket)"

        let body: [String: Any] = [
            "BaseRequest": baseRequest(),
            "CmdId": 3,
            "OP": pinned ? 1 : 0,
            "UserName": userName
        ]

        let _ = try await httpPost(url, json: body)
    }

    func logout() async throws {
        let url = "\(baseURL)/cgi-bin/mmwebwx-bin/webwxlogout?redirect=1&type=0&skey=\(skey.urlEncoded)"
        let body: [String: Any] = [
            "sid": sid,
            "uin": uin
        ]
        let _ = try? await httpPost(url, json: body)
        stopSync()
        await MainActor.run {
            self.loginState = .idle
            self.userInfo = nil
        }
    }

    private func baseRequest() -> [String: Any] {
        [
            "Uin": Int(uin) ?? 0,
            "Sid": sid,
            "Skey": skey,
            "DeviceID": deviceID
        ]
    }

    private func formatSyncKey() {
        guard let list = syncKey["List"] as? [[String: Any]] else { return }
        syncKeyFormatted = list.map { "\($0["Key"] ?? 0)_\($0["Val"] ?? 0)" }.joined(separator: "|")
    }

    private func timestamp() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    private func uosExtSpam() -> String {
        "Go8FCIkFEokFCggwMDAwMDAwMRAGGvAESySibk50w5Wb3AGDa2sourBKarJKanBLqE7MBLwIeHKo0C8iSiVFFQkJBElFQNAhNwQyiJ8AEY6bLksFEILGFWBxBIJBJAEpYRRBRxFIkFEIJFFQkJHEZFAAQalFIcFEchERJASEZBJEJAQkJFRR4FAAkRFREJBQ3E"
    }

    private func extractXMLValue(_ xml: String, tag: String) -> String {
        guard let start = xml.range(of: "<\(tag)>"),
              let end = xml.range(of: "</\(tag)>") else { return "" }
        return String(xml[start.upperBound..<end.lowerBound])
    }

    private func extractJSValue(_ js: String, key: String) -> String {
        guard let range = js.range(of: "\(key):\"([^\"]+)\"", options: String.CompareOptions.regularExpression) else { return "0" }
        let match = String(js[range])
        let parts = match.split(separator: "\"")
        return parts.count > 1 ? String(parts[1]) : "0"
    }

    private func httpGet(_ urlString: String, timeout: TimeInterval = 15) async throws -> Data {
        guard let url = URL(string: urlString) else { throw WXError.invalidURL }
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
        let (data, _) = try await session.data(for: request)
        return data
    }

    private func httpPost(_ urlString: String, json body: [String: Any]) async throws -> Data {
        guard let url = URL(string: urlString) else { throw WXError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json; charset=UTF-8", forHTTPHeaderField: "Content-Type")
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, _) = try await session.data(for: request)
        return data
    }
}

enum WXError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case loginFailed(String)
    case sendFailed
    case uploadFailed
    case sessionExpired

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid server response"
        case .loginFailed(let msg): return "Login failed: \(msg)"
        case .sendFailed: return "Failed to send message"
        case .uploadFailed: return "Failed to upload media"
        case .sessionExpired: return "Session expired"
        }
    }
}

extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
}

extension Data {
    mutating func appendMultipart(boundary: String, name: String, value: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }

    var md5String: String {
        var digest = [UInt8](repeating: 0, count: 16)
        _ = withUnsafeBytes { body in
            CC_MD5(body.baseAddress, CC_LONG(count), &digest)
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
