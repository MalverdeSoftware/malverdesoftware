// Shapes of the identifiers and secrets this package reads. They mirror the relay's and the envelope's own checks.
export const APP = /^[a-z0-9-]{1,40}$/;
export const ID = /^[A-Za-z0-9_-]{22}$/;
export const SECRET = /^[A-Za-z0-9_-]{43}$/;
