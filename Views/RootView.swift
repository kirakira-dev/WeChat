import SwiftUI

struct RootView: View {
    @EnvironmentObject var session: SessionManager

    var body: some View {
        Group {
            if session.isLoggedIn {
                MainView()
            } else {
                LoginView()
            }
        }
        .task {
            if !session.isLoggedIn {
                await session.initialize()
            }
        }
    }
}
