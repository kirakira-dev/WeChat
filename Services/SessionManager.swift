import Foundation
import SwiftUI
import CommonCrypto

@MainActor
class SessionManager: ObservableObject {
    static let shared = SessionManager()

    @Published var isLoggedIn = false
    @Published var contacts: [WXContact] = []
    @Published var chatSessions: [ChatSession] = []
    @Published var selectedChat: ChatSession?
    @Published var currentTab: SidebarTab = .chats
    @Published var dataSource: DataSource = .none
    @Published var dbKeyStatus: DBKeyStatus = .checking
    @Published var statusMessage: String = ""

    let api = WeChatAPI.shared
    let dataReader = WeChatDataReader.shared

    private var contactMap: [String: WXContact] = [:]
    private var sessionMap: [String: ChatSession] = [:]
    private var contactDB: SQLCipherReader?
    private var messageDB: SQLCipherReader?
    private var sessionDB: SQLCipherReader?
    private var selfRowId: Int = 0

    enum SidebarTab {
        case chats
        case contacts
        case favorites
        case miniPrograms
    }

    enum DataSource {
        case none
        case localDB
        case webProtocol
    }

    enum DBKeyStatus: Equatable {
        case checking
        case noKey
        case extracting
        case ready
        case failed(String)
    }

    private init() {
        api.onNewMessages = { [weak self] messages in
            Task { @MainActor in
                self?.handleNewMessages(messages)
            }
        }

        api.onContactUpdate = { [weak self] contacts in
            Task { @MainActor in
                self?.handleContactUpdates(contacts)
            }
        }

        let defaultTab = AppSettings.shared.defaultTab
        switch defaultTab {
        case "contacts": currentTab = .contacts
        case "favorites": currentTab = .favorites
        default: currentTab = .chats
        }
    }

    var hasInitialized = false

    func initialize() async {
        guard !hasInitialized else { return }
        hasInitialized = true
        NSLog("[SessionManager] initialize() called")
        statusMessage = "Checking WeChat data..."

        let containerExists = FileManager.default.fileExists(atPath: dataReader.containerBase)
        guard containerExists else {
            statusMessage = "WeChat data not found. Use QR code login."
            dbKeyStatus = .noKey
            return
        }

        guard !dataReader.wxid.isEmpty else {
            statusMessage = "No WeChat user data found. Use QR code login."
            dbKeyStatus = .noKey
            return
        }

        statusMessage = "Found user: \(dataReader.wxid)"

        if dataReader.hasKeys {
            dbKeyStatus = .ready
            await loadLocalData()
            return
        }

        statusMessage = "Attempting automatic key extraction..."
        dbKeyStatus = .extracting
        let extracted = await Task.detached {
            self.dataReader.extractKeysFromRunningWeChat()
        }.value

        if extracted && dataReader.hasKeys {
            NSLog("[SessionManager] Auto key extraction succeeded")
            dbKeyStatus = .ready
            await loadLocalData()
            return
        }

        NSLog("[SessionManager] Auto key extraction failed, waiting for manual input")
        dbKeyStatus = .noKey
        statusMessage = "DB keys not found. Run key extractor or enter manually."
    }

    func loadLocalData() async {
        guard dataReader.hasKeys else { return }

        statusMessage = "Opening databases..."

        if let key = dataReader.pragmaKey(forDBFile: dataReader.contactDBPath) {
            let cdb = SQLCipherReader(path: dataReader.contactDBPath, pragmaKey: key)
            if cdb.open() {
                contactDB = cdb
            }
        }

        if let key = dataReader.pragmaKey(forDBFile: dataReader.sessionDBPath) {
            let sdb = SQLCipherReader(path: dataReader.sessionDBPath, pragmaKey: key)
            if sdb.open() {
                sessionDB = sdb
            }
        }

        if let key = dataReader.pragmaKey(forDBFile: dataReader.messageDBPath) {
            let mdb = SQLCipherReader(path: dataReader.messageDBPath, pragmaKey: key)
            if mdb.open() {
                messageDB = mdb
            }
        }

        if contactDB == nil && messageDB == nil && sessionDB == nil {
            statusMessage = "Failed to open databases. Keys may be stale."
            dbKeyStatus = .failed("All databases failed to open")
            return
        }

        statusMessage = "Loading contacts..."

        if let cdb = contactDB {
            loadContactsFromDB(cdb)
        }

        if let sdb = sessionDB {
            loadSessionsFromDB(sdb)
        }

        if let mdb = messageDB {
            let idRows = mdb.query("SELECT rowid FROM Name2Id WHERE user_name = '\(dataReader.wxid)'")
            if let row = idRows.first, let rid = row["rowid"] as? Int {
                selfRowId = rid
                NSLog("[SessionManager] Self rowid in Name2Id: \(selfRowId)")
            }
        }

        if messageDB != nil {
            for session in chatSessions.prefix(20) {
                loadMessagesForSession(session)
            }
        }

        dataSource = .localDB
        isLoggedIn = true
        statusMessage = "Loaded \(contacts.count) contacts, \(chatSessions.count) conversations"
    }

    private func loadContactsFromDB(_ db: SQLCipherReader) {
        let rows = db.query("""
            SELECT username, nick_name, local_type, alias, remark,
                   big_head_url, small_head_url, description
            FROM contact
            WHERE username != '' AND local_type != 0
            ORDER BY nick_name COLLATE NOCASE
        """)

        for row in rows {
            let userName = row["username"] as? String ?? ""
            let nickName = row["nick_name"] as? String ?? ""
            let remark = row["remark"] as? String ?? ""
            let bigHeadUrl = row["big_head_url"] as? String ?? ""
            let smallHeadUrl = row["small_head_url"] as? String ?? ""
            let localType = row["local_type"] as? Int ?? 0
            let desc = row["description"] as? String ?? ""

            let contact = WXContact(
                id: userName,
                nickname: nickName,
                remarkName: remark,
                avatarURL: bigHeadUrl.isEmpty ? smallHeadUrl : bigHeadUrl,
                sex: 0,
                signature: desc,
                province: "",
                city: "",
                contactFlag: localType,
                snsFlag: 0,
                isGroup: userName.contains("@chatroom"),
                memberCount: 0,
                memberList: [],
                pinyin: ""
            )

            if !contact.isSpecial {
                contactMap[userName] = contact
            }
        }

        contacts = Array(contactMap.values)
            .filter { !$0.id.isEmpty }
            .sorted { $0.displayName.localizedCompare($1.displayName) == .orderedAscending }

        NSLog("[SessionManager] Loaded \(contacts.count) contacts")
    }

    private func loadSessionsFromDB(_ db: SQLCipherReader) {
        let rows = db.query("""
            SELECT username, unread_count, summary, last_timestamp, sort_timestamp,
                   last_msg_sender, last_sender_display_name, last_msg_type
            FROM SessionTable
            WHERE username != '' AND is_hidden = 0
            ORDER BY sort_timestamp DESC
            LIMIT 200
        """)

        let systemAccounts: Set<String> = [
            "newsapp", "fmessage", "filehelper", "weibo", "qqmail",
            "tmessage", "qmessage", "qqsync", "floatbottle",
            "lbsapp", "shakeapp", "medianote", "qqfriend",
            "readerapp", "blogapp", "facebookapp", "masssendapp",
            "meaborobot", "feedsapp", "voip", "blogappweixin",
            "weixin", "brandsessionholder", "weixinreminder",
            "officialaccounts", "notification_messages", "wxitil",
            "userexperience_alarm"
        ]

        for row in rows {
            let userName = row["username"] as? String ?? ""
            guard !systemAccounts.contains(userName),
                  !userName.hasPrefix("gh_") else { continue }

            let unread = row["unread_count"] as? Int ?? 0
            let summary = row["summary"] as? String ?? ""
            let lastTime = row["last_timestamp"] as? Int ?? 0
            let lastSender = row["last_msg_sender"] as? String ?? ""

            let session = getOrCreateSession(for: userName)
            session.unreadCount = unread

            if !summary.isEmpty {
                let msg = WXMessage(
                    id: "session_\(userName)",
                    fromUser: lastSender.isEmpty ? userName : lastSender,
                    toUser: dataReader.wxid,
                    content: summary,
                    msgType: .text,
                    timestamp: TimeInterval(lastTime),
                    statusNotifyCode: 0,
                    statusNotifyUserName: "",
                    localID: "session_\(userName)",
                    isFromSelf: lastSender == dataReader.wxid
                )
                session.messages = [msg]
            }
        }

        NSLog("[SessionManager] Loaded \(chatSessions.count) sessions")
    }

    func loadMessagesForSession(_ session: ChatSession) {
        guard let mdb = messageDB else { return }

        let tableName = WeChatDataReader.messageTableName(for: session.id)
        let limit = AppSettings.shared.chatHistoryLimit

        let rows = mdb.query("""
            SELECT local_id, server_id, local_type, real_sender_id, create_time,
                   message_content, sort_seq
            FROM \(tableName)
            ORDER BY sort_seq DESC
            LIMIT \(limit)
        """)

        if rows.isEmpty { return }

        var messages: [WXMessage] = []
        for row in rows.reversed() {
            let localId = row["local_id"] as? Int ?? 0
            let serverId = row["server_id"] as? Int ?? 0
            let localType = row["local_type"] as? Int ?? 1
            let realSenderId = row["real_sender_id"] as? Int ?? 0
            let createTime = row["create_time"] as? Int ?? 0
            let content = row["message_content"] as? String ?? ""

            guard !content.isEmpty else { continue }

            let actualType = localType & 0xFFFF
            let isSelf = (selfRowId > 0) && (realSenderId == selfRowId)

            var msgContent = content
            var senderID = session.id

            if session.contact.isGroup {
                if let colonNewline = content.range(of: ":\n") {
                    senderID = String(content[content.startIndex..<colonNewline.lowerBound])
                    msgContent = String(content[colonNewline.upperBound...])
                }
                if isSelf {
                    senderID = dataReader.wxid
                }
            }

            let msg = WXMessage(
                id: "\(serverId > 0 ? serverId : localId)",
                fromUser: isSelf ? dataReader.wxid : senderID,
                toUser: isSelf ? session.id : dataReader.wxid,
                content: msgContent,
                msgType: WXMsgType(rawValue: actualType) ?? .text,
                timestamp: TimeInterval(createTime),
                statusNotifyCode: 0,
                statusNotifyUserName: "",
                localID: "\(localId)",
                isFromSelf: isSelf
            )
            messages.append(msg)
        }

        if !messages.isEmpty {
            session.messages = messages
            objectWillChange.send()
        }
    }

    func login() async {
        do {
            let _ = try await api.getUUID()
            let _ = try await api.getQRCode()

            var loggedIn = false
            while !loggedIn {
                let (success, redirectURL) = try await api.pollForLogin()
                if success, let redirect = redirectURL {
                    try await api.completeLogin(redirectURL: redirect)
                    loggedIn = true
                }
                try await Task.sleep(nanoseconds: 1_000_000_000)
            }

            let initialMessages = try await api.webwxInit()
            handleNewMessages(initialMessages)

            let contactList = try await api.getContactList()
            handleContactUpdates(contactList)

            dataSource = .webProtocol
            isLoggedIn = true

            api.startSyncLoop()

        } catch {
            NSLog("[SessionManager] Login error: \(error)")
            api.loginState = .failed(error.localizedDescription)
        }
    }

    func logout() async {
        if dataSource == .webProtocol {
            try? await api.logout()
        }
        contactDB?.close()
        messageDB?.close()
        sessionDB?.close()
        isLoggedIn = false
        dataSource = .none
        contacts = []
        chatSessions = []
        selectedChat = nil
        contactMap = [:]
        sessionMap = [:]
    }

    func handleNewMessages(_ messages: [WXMessage]) {
        for msg in messages {
            let chatID = msg.isFromSelf ? msg.toUser : msg.fromUser
            let session = getOrCreateSession(for: chatID)
            session.appendMessage(msg)

            if let idx = chatSessions.firstIndex(where: { $0.id == chatID }) {
                let s = chatSessions.remove(at: idx)
                chatSessions.insert(s, at: 0)
            }

            if AppSettings.shared.autoSwitchToNewChat && !msg.isFromSelf && selectedChat == nil {
                selectedChat = session
            }

            objectWillChange.send()
        }
    }

    func handleContactUpdates(_ updatedContacts: [WXContact]) {
        for contact in updatedContacts {
            contactMap[contact.id] = contact
            if let session = sessionMap[contact.id] {
                session.contact = contact
            }
        }

        contacts = Array(contactMap.values)
            .filter { !$0.isSpecial && !$0.id.isEmpty }
            .sorted { $0.displayName.localizedCompare($1.displayName) == .orderedAscending }
    }

    func getOrCreateSession(for userName: String) -> ChatSession {
        if let existing = sessionMap[userName] {
            return existing
        }

        let contact = contactMap[userName] ?? WXContact(
            id: userName,
            nickname: userName,
            remarkName: "",
            avatarURL: "",
            sex: 0,
            signature: "",
            province: "",
            city: "",
            contactFlag: 0,
            snsFlag: 0,
            isGroup: userName.contains("@chatroom"),
            memberCount: 0,
            memberList: [],
            pinyin: ""
        )

        let session = ChatSession(id: userName, contact: contact)
        sessionMap[userName] = session

        if !chatSessions.contains(where: { $0.id == userName }) {
            chatSessions.append(session)
        }

        return session
    }

    func selectChat(_ session: ChatSession) {
        selectedChat = session
        session.markAsRead()

        if dataSource == .localDB && session.messages.count <= 1 {
            loadMessagesForSession(session)
        }
    }

    func openChat(with contact: WXContact) {
        let session = getOrCreateSession(for: contact.id)
        session.contact = contact
        if !chatSessions.contains(where: { $0.id == contact.id }) {
            chatSessions.insert(session, at: 0)
        }
        selectChat(session)
        currentTab = .chats
    }

    func sendMessage(text: String) async {
        guard let chat = selectedChat, !text.isEmpty else { return }

        let localMsg = WXMessage(
            id: UUID().uuidString,
            fromUser: api.userInfo?.id ?? dataReader.wxid,
            toUser: chat.id,
            content: text,
            msgType: .text,
            timestamp: Date().timeIntervalSince1970,
            statusNotifyCode: 0,
            statusNotifyUserName: "",
            localID: UUID().uuidString,
            isFromSelf: true
        )
        chat.appendMessage(localMsg)
        objectWillChange.send()

        if dataSource == .webProtocol {
            do {
                let _ = try await api.sendTextMessage(to: chat.id, content: text)
            } catch {
                NSLog("[Send] Failed: \(error)")
            }
        }
    }

    func sendImage(data: Data, filename: String) async {
        guard let chat = selectedChat, dataSource == .webProtocol else { return }
        do {
            let _ = try await api.sendImageMessage(to: chat.id, imageData: data, filename: filename)
        } catch {
            NSLog("[Send Image] Failed: \(error)")
        }
    }

    func sendFile(data: Data, filename: String) async {
        guard let chat = selectedChat, dataSource == .webProtocol else { return }
        do {
            let _ = try await api.sendFileMessage(to: chat.id, fileData: data, filename: filename)
        } catch {
            NSLog("[Send File] Failed: \(error)")
        }
    }

    func contact(for userName: String) -> WXContact? {
        contactMap[userName]
    }

    var groupContacts: [WXContact] {
        contacts.filter { $0.isGroup }
    }

    var personalContacts: [WXContact] {
        contacts.filter { !$0.isGroup }
    }
}
