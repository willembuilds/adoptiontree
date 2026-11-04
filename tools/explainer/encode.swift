import AVFoundation
import AppKit
let a = CommandLine.arguments
let dir = a[1], fps = Int32(a[2])!, dst = URL(fileURLWithPath: a[3]), kbps = Int(a[4])!
try? FileManager.default.removeItem(at: dst)
let writer = try AVAssetWriter(outputURL: dst, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 1920, AVVideoHeightKey: 1080,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: kbps * 1000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: 60, AVVideoAllowFrameReorderingKey: true, AVVideoExpectedSourceFrameRateKey: Int(fps)]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: 1920, kCVPixelBufferHeightKey as String: 1080])
writer.add(input)
guard writer.startWriting() else { print("start failed", writer.error ?? ""); exit(1) }
writer.startSession(atSourceTime: .zero)
var i = 0
while true {
  let path = String(format: "%@/f%05d.png", dir, i)
  guard FileManager.default.fileExists(atPath: path), let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { break }
  var pb: CVPixelBuffer? = nil
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  guard let buf = pb else { print("no buffer"); exit(1) }
  CVPixelBufferLockBaseAddress(buf, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: 1920, height: 1080, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: 1920, height: 1080))
  CVPixelBufferUnlockBaseAddress(buf, [])
  while !input.isReadyForMoreMediaData { usleep(2000) }
  if !adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps)) { print("append failed at", i, writer.error ?? ""); exit(1) }
  i += 1
  if i % 300 == 0 { print("encoded", i) }
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0); writer.finishWriting { sem.signal() }; sem.wait()
print("frames", i, "status", writer.status.rawValue, writer.error.map { "\($0)" } ?? "ok")
