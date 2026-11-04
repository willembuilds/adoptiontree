import AVFoundation
let a = CommandLine.arguments
let video = URL(fileURLWithPath: a[1]), audio = URL(fileURLWithPath: a[2]), dst = URL(fileURLWithPath: a[3])
try? FileManager.default.removeItem(at: dst)
let comp = AVMutableComposition()
let v = AVURLAsset(url: video), au = AVURLAsset(url: audio)
let vt = v.tracks(withMediaType: .video)[0], at = au.tracks(withMediaType: .audio)[0]
let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let ca = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
try cv.insertTimeRange(CMTimeRange(start: .zero, duration: v.duration), of: vt, at: .zero)
let adur = CMTimeMinimum(au.duration, v.duration)
try ca.insertTimeRange(CMTimeRange(start: .zero, duration: adur), of: at, at: .zero)
let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough)!
ex.outputURL = dst; ex.outputFileType = .mp4; ex.shouldOptimizeForNetworkUse = true
let sem = DispatchSemaphore(value: 0); ex.exportAsynchronously { sem.signal() }; sem.wait()
print("export status", ex.status.rawValue, ex.error.map { "\($0)" } ?? "ok", "video", v.duration.seconds, "audio", au.duration.seconds)
