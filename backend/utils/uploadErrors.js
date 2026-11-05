// Response body for a multer error that is not a size limit. Never forwards err.message to the client
// (it could be in any language); the frontend translates by `code`.
const FILE_TYPE_ERRORS = new Set(['Invalid file type', 'Only PNG signatures are allowed']);

const uploadErrorBody = (err, fallbackText) => (
  FILE_TYPE_ERRORS.has(err?.message)
    ? { error: 'Invalid file type', code: 'invalid_file_type' }
    : { error: fallbackText, code: 'upload_failed' }
);

module.exports = { uploadErrorBody, FILE_TYPE_ERRORS };
