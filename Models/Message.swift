import Foundation

struct WXMessage: Identifiable, Codable, Hashable {
    let id: String
    var fromUser: String
    var toUser: String
    var content: String
    var msgType: WXMsgType
    var timestamp: TimeInterval
    var statusNotifyCode: Int
    var statusNotifyUserName: String
    var localID: String
    var isFromSelf: Bool

    var displayContent: String {
        switch msgType {
        case .text:
            if content.contains(":<br/>") {
                return String(content.split(separator: ":<br/>", maxSplits: 1).last ?? "")
            }
            return content.replacingOccurrences(of: "<br/>", with: "\n")
        case .image:
            return "[Image]"
        case .voice:
            return "[Voice]"
        case .video:
            return "[Video]"
        case .emoticon:
            return "[Sticker]"
        case .location:
            return "[Location]"
        case .link:
            return "[Link]"
        case .file:
            return "[File]"
        case .system:
            return content
        case .recalled:
            return "[Message Recalled]"
        default:
            return content
        }
    }

    var formattedTime: String {
        let date = Date(timeIntervalSince1970: timestamp)
        let calendar = Calendar.current
        let formatter = DateFormatter()

        if calendar.isDateInToday(date) {
            formatter.dateFormat = "HH:mm"
        } else if calendar.isDateInYesterday(date) {
            formatter.dateFormat = "'Yesterday' HH:mm"
        } else {
            formatter.dateFormat = "MM/dd HH:mm"
        }
        return formatter.string(from: date)
    }

    static func fromWebDict(_ dict: [String: Any], selfUserName: String) -> WXMessage {
        let from = dict["FromUserName"] as? String ?? ""
        return WXMessage(
            id: "\(dict["MsgId"] as? String ?? UUID().uuidString)",
            fromUser: from,
            toUser: dict["ToUserName"] as? String ?? "",
            content: dict["Content"] as? String ?? "",
            msgType: WXMsgType(rawValue: dict["MsgType"] as? Int ?? 1) ?? .text,
            timestamp: TimeInterval(dict["CreateTime"] as? Int ?? 0),
            statusNotifyCode: dict["StatusNotifyCode"] as? Int ?? 0,
            statusNotifyUserName: dict["StatusNotifyUserName"] as? String ?? "",
            localID: dict["MsgId"] as? String ?? "",
            isFromSelf: from == selfUserName
        )
    }
}

enum WXMsgType: Int, Codable {
    case text = 1
    case image = 3
    case voice = 34
    case verifyMsg = 37
    case possibleFriend = 40
    case shareCard = 42
    case video = 43
    case emoticon = 47
    case location = 48
    case link = 49
    case voipMsg = 50
    case statusNotify = 51
    case voipNotify = 52
    case voipInvite = 53
    case smallVideo = 62
    case sysNotice = 9999
    case system = 10000
    case recalled = 10002
    case file = 6
    case unknown = -1
}
