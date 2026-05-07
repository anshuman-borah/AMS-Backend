import ApiError from "../utils/ApiError.js";

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    return next(new ApiError(result.error.issues[0].message, 400));
  }

  req.body = result.data; 
  next();
};