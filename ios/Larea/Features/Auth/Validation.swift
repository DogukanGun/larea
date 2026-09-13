import Foundation

/// Client-side validation mirroring the backend rules; returns a message or nil when valid.
enum Validation {
    static func email(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return "Enter your email address." }
        let pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
        return trimmed.wholeMatch(of: pattern) == nil ? "That doesn't look like an email address." : nil
    }

    static func password(_ value: String) -> String? {
        if value.isEmpty { return "Choose a password." }
        if value.count < 10 { return "Use at least 10 characters." }
        if value.count > 128 { return "Use at most 128 characters." }
        return nil
    }

    static func displayName(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return "Pick a display name." }
        let pattern = /^[\p{L}\p{N}_.][\p{L}\p{N}_. ]{1,22}[\p{L}\p{N}_.]$/
        return trimmed.wholeMatch(of: pattern) == nil ? "3–24 characters: letters, numbers, spaces, underscores or dots." : nil
    }
}
