import SwiftUI

extension Color {
    static var wechatGreen: Color {
        if AppSettings.shared.themeMode == "custom" {
            return AppSettings.shared.customAccentColor
        }
        return Color(red: 0.07, green: 0.73, blue: 0.33)
    }

    static var wechatDarkGreen: Color {
        if AppSettings.shared.themeMode == "custom" {
            let s = AppSettings.shared
            return Color(red: s.customAccentR * 0.75, green: s.customAccentG * 0.75, blue: s.customAccentB * 0.75)
        }
        return Color(red: 0.05, green: 0.55, blue: 0.25)
    }

    static let sidebarBackground = Color(red: 0.15, green: 0.15, blue: 0.15)
    static let sidebarSelected = Color(red: 0.22, green: 0.22, blue: 0.22)
    static let sidebarHover = Color(red: 0.19, green: 0.19, blue: 0.19)
    static let sidebarIcon = Color(red: 0.60, green: 0.60, blue: 0.60)

    static var sidebarIconActive: Color {
        wechatGreen
    }

    static let chatListBackground = Color("ChatListBackground")
    static let chatListSelected = Color("ChatListSelected")
    static let chatListHover = Color("ChatListHover")

    static var chatBackground: Color {
        if AppSettings.shared.themeMode == "custom" {
            return AppSettings.shared.customBackgroundColor
        }
        return Color("ChatBackground")
    }

    static let chatInputBackground = Color("ChatInputBackground")

    static var bubbleSelf: Color {
        if AppSettings.shared.themeMode == "custom" {
            return AppSettings.shared.customBubbleColor
        }
        return Color(red: 0.58, green: 0.87, blue: 0.34)
    }

    static let bubbleOther = Color("BubbleOther")
    static let primaryText = Color("PrimaryText")
    static let secondaryText = Color("SecondaryText")
    static let chatHeaderText = Color("ChatHeaderText")
    static let divider = Color("Divider")
    static let badgeRed = Color(red: 0.98, green: 0.27, blue: 0.23)
    static let loginBackground = Color("ChatBackground")
    static let systemMsgBackground = Color("SystemMsgBackground")
}
