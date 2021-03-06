var mongoose = require('mongoose');
var User = mongoose.model('User');
var Resource = mongoose.model('Resource');
var messaging = require('../../lib/messaging');
var validator = require('validator');
var _ = require('underscore');

var formidable = require('formidable');
var cloudinary = require('cloudinary');
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});


exports.load = function(req,res,next,id){
  Resource.findById(id).populate('creator', '_id name bio picture').exec(function(err, rt){
    if (err)
      return res.status(400).json(messaging.mongooseErrors(err, 'resource_type'));
    else if (!rt)
      return res.status(404).json(messaging.error('errors.resources.not_found'));
    else {
      req.object = rt;
      next();
    }
  });
}

/* Create new */
exports.create = function(req, res, next) {
  var rt = new Resource(req.body);

  rt.creator = req.user._id;

  rt.save(function(err) {
    if (err) res.status(400).json(messaging.mongooseErrors(err, 'resources'));
    else res.status(201).json(rt);
  });
}

/* Update */
exports.update = function(req, res, next) {
  var rs = _.extend(req.object, req.body);

  rs.save(function(err) {
    if(err)
      res.status(400).json(messaging.mongooseErrors(err, 'resources'));
    else
      res.status(200).json(rs);
  });
}

/* Remove */
exports.remove = function(req, res, next) {
  var resource = req.object;

  resource.remove(function(err) {
    if (err) return res.sendStatus(500);
    else res.sendStatus(200);
  });
}


/* Upload image */
exports.updateImage = function(req, res, next) {
  var resource = req.object;

  // parse a file upload
  var form = new formidable.IncomingForm();

  form.parse(req, function(err, fields, files) {
    cloudinary.uploader.upload(files.file.path, function(result) {
      if (result.error)
        return res.status(400).json(messaging.error('errors.resources.image.upload_error'));
      else {
        resource.image = result;
        resource.image.url = cloudinary.url(resource.image.public_id, { width: 1000, height: 1000, crop: "limit" });
        resource.save(function(err) {
          if(err)
            res.status(400).json(messaging.mongooseErrors(err, 'resources'));
          else
            res.status(200).json(resource);
        });
      }
    });
  });
}

/* Show  */
exports.show = function(req, res, next) {
  res.status(200).json(req.object);
}

/* List */
exports.list = function(req, res, next) {
  var page = req.query['page'];
  var perPage = req.query['perPage'];
  var bbox = req.query['bbox'];

  /* Validate query parameters */
  if (page) {
    if (!validator.isInt(page))
      return res.status(400).json(messaging.error('errors.resources.list.invalid_pagination'));
    else
      page = parseInt(page) - 1;
  } else page = 0;

  if (perPage){
    if (!validator.isInt(perPage))
      return res.status(400).json(messaging.error('errors.resources.list.invalid_pagination'));
    else
      perPage = parseInt(perPage);
  } else perPage = 30;

  /* Mongoose Options */
  var options = {
    perPage: perPage,
    page: page
  };

  if (bbox) {

    if (typeof(bbox) == 'string')
      bbox = JSON.parse(bbox);

    var coordinates = _.map(bbox.coordinates, function(lonlat){
      return [parseFloat(lonlat[0]), parseFloat(lonlat[1])];
    })

    options.criteria = {
      geometry: {
        $geoWithin: {
          $box: coordinates
        }
      }
    }
  }

  Resource.list(options, function (err, resources) {
    if (err){
      return res.status(500).json(messaging.error('errors.internal_error'));
    }

    /* Send response */
    Resource.count().exec(function (err, count) {
      res.status(200).json({
        count: count,
        perPage: perPage,
        page: page + 1,
        resources: resources
      });
    });
  });
}
