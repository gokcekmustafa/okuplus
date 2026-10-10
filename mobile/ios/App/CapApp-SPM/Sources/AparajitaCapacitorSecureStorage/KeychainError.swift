import Capacitor

public class KeychainError: Error {
  enum ErrorKind: String {
    case missingKey
    case invalidData
    case osError
    case unknownError
  }

  private static let errorMap: [ErrorKind: String] = [
    .missingKey: "Empty key",
    .invalidData: "The data is in an invalid format",
    .osError: "An OS error occurred (%d)",
    .unknownError: "An unknown error occurred"
  ]

  var message = ""
  var code = ""

  init(_ kind: ErrorKind) {
    initialize(kind)
  }

  init(_ kind: ErrorKind, status: OSStatus) {
    initialize(kind, status: status)
  }

  private func initialize(_ kind: ErrorKind, status: OSStatus = 0) {
    guard let template = Self.errorMap[kind] else { return }
    message = kind == .osError ? String(format: template, status) : template
    code = kind.rawValue
  }

  func rejectCall(_ call: CAPPluginCall) {
    call.reject(message, code)
  }

  static func reject(call: CAPPluginCall, kind: ErrorKind, status: OSStatus = 0) {
    KeychainError(kind, status: status).rejectCall(call)
  }
}
