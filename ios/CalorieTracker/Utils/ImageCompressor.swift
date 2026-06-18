import UIKit

/// Downscales and re-encodes images before upload so the multipart request stays
/// well under Vercel's ~4.5 MB serverless request-body limit (full-resolution
/// iPhone photos otherwise trigger HTTP 413). Gemini analysis works well at
/// ~1.5k px, so the visual loss is immaterial.
enum ImageCompressor {
    /// Returns JPEG data downscaled to `maxDimension` on its longest edge and
    /// compressed below `maxBytes` where possible. If `data` is not a decodable
    /// image, the original bytes are returned unchanged.
    static func compressForUpload(
        _ data: Data,
        maxDimension: CGFloat = 1536,
        maxBytes: Int = 3_000_000
    ) -> Data {
        guard let image = UIImage(data: data) else { return data }
        let resized = downscale(image, maxDimension: maxDimension)

        var quality: CGFloat = 0.7
        var output = resized.jpegData(compressionQuality: quality) ?? data
        while output.count > maxBytes, quality > 0.3 {
            quality -= 0.1
            if let smaller = resized.jpegData(compressionQuality: quality) {
                output = smaller
            }
        }
        return output
    }

    /// Scales the image down so its longest edge is at most `maxDimension`.
    /// Images already within bounds are returned unchanged (never upscaled).
    private static func downscale(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let longestEdge = max(image.size.width, image.size.height)
        guard longestEdge > maxDimension else { return image }

        let scale = maxDimension / longestEdge
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1 // newSize is already in pixels
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
