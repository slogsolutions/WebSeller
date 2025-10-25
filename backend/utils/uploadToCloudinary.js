const cloudinary = require('../config/cloudinary');

const uploadBuffer = (buffer, folder = process.env.CLOUDINARY_FOLDER || 'parkfinder') =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });

module.exports = { uploadBuffer };
