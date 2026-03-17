import Foundation

struct WXContact: Identifiable, Codable, Hashable {
    let id: String
    var nickname: String
    var remarkName: String
    var avatarURL: String
    var sex: Int
    var signature: String
    var province: String
    var city: String
    var contactFlag: Int
    var snsFlag: Int
    var isGroup: Bool
    var memberCount: Int
    var memberList: [GroupMember]
    var pinyin: String

    var displayName: String {
        if !remarkName.isEmpty { return remarkName }
        return nickname
    }

    var isSpecial: Bool {
        let specialAccounts = [
            "newsapp", "fmessage", "filehelper", "weibo", "qqmail",
            "tmessage", "qmessage", "qqsync", "floatbottle",
            "lbsapp", "shakeapp", "medianote", "qqfriend",
            "readerapp", "blogapp", "facebookapp", "masssendapp",
            "meaborobot", "feedsapp", "voip", "blogappweixin",
            "weixin", "brandsessionholder", "weixinreminder",
            "officialaccounts", "wxid_novlwrv3lqwv11",
            "gh_22b87fa7cb3c", "userexperience_alarm",
            "notification_messages", "wxitil", "userexperience_alarm"
        ]
        return specialAccounts.contains(id)
    }

    struct GroupMember: Codable, Hashable {
        let userName: String
        let nickName: String
        let displayName: String
    }

    static func fromWebDict(_ dict: [String: Any]) -> WXContact {
        WXContact(
            id: dict["UserName"] as? String ?? "",
            nickname: dict["NickName"] as? String ?? "",
            remarkName: dict["RemarkName"] as? String ?? "",
            avatarURL: dict["HeadImgUrl"] as? String ?? "",
            sex: dict["Sex"] as? Int ?? 0,
            signature: dict["Signature"] as? String ?? "",
            province: dict["Province"] as? String ?? "",
            city: dict["City"] as? String ?? "",
            contactFlag: dict["ContactFlag"] as? Int ?? 0,
            snsFlag: dict["SnsFlag"] as? Int ?? 0,
            isGroup: (dict["UserName"] as? String ?? "").hasPrefix("@@"),
            memberCount: dict["MemberCount"] as? Int ?? 0,
            memberList: (dict["MemberList"] as? [[String: Any]])?.map {
                GroupMember(
                    userName: $0["UserName"] as? String ?? "",
                    nickName: $0["NickName"] as? String ?? "",
                    displayName: $0["DisplayName"] as? String ?? ""
                )
            } ?? [],
            pinyin: dict["PYInitial"] as? String ?? ""
        )
    }
}
