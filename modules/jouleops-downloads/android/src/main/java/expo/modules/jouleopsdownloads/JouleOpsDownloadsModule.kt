package expo.modules.jouleopsdownloads

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.InputStream

/**
 * Saves an exported file straight into the public Downloads folder through
 * MediaStore — no folder picker and no storage permission (Android 10+).
 * The Storage Access Framework picker that this replaces can't be granted the
 * Download folder itself on Android 11+ ("Can't use this folder").
 *
 * Android 9 and below would need WRITE_EXTERNAL_STORAGE; there the JS side
 * falls back to its folder picker instead (ERR_UNSUPPORTED).
 */
class JouleOpsDownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JouleOpsDownloads")

    /**
     * Copies `sourceUri` (a file:// or content:// URI the app can read) into
     * Downloads as `fileName`. Resolves with the name actually used —
     * MediaStore appends " (1)" etc. when the name is taken.
     */
    AsyncFunction("saveToDownloads") { sourceUri: String, fileName: String, mimeType: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        throw CodedException("ERR_UNSUPPORTED", "Saving to Downloads needs Android 10 or newer", null)
      }
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val resolver = context.contentResolver

      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        // Hidden from other apps until the bytes are written.
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      val item = resolver.insert(collection, values)
        ?: throw CodedException("ERR_SAVE_FAILED", "Couldn't create the file in Downloads", null)

      try {
        openSource(sourceUri).use { input ->
          val output = resolver.openOutputStream(item)
            ?: throw CodedException("ERR_SAVE_FAILED", "Couldn't write the file in Downloads", null)
          output.use { input.copyTo(it) }
        }
        val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
        resolver.update(item, done, null, null)
      } catch (e: Exception) {
        // Don't leave a half-written, pending entry behind.
        resolver.delete(item, null, null)
        throw e
      }

      resolver.query(item, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) return@AsyncFunction cursor.getString(0) ?: fileName
      }
      fileName
    }
  }

  private fun openSource(sourceUri: String): InputStream {
    val uri = Uri.parse(sourceUri)
    if (uri.scheme == null || uri.scheme == "file") {
      return FileInputStream(File(uri.path ?: sourceUri))
    }
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    return context.contentResolver.openInputStream(uri)
      ?: throw CodedException("ERR_SOURCE", "Couldn't read the exported file", null)
  }
}
