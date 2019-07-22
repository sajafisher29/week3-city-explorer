'use strict';

//Load environment variables from the dotenv file
require('dotenv').config();

//Application dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

//Cache timeouts
const timeouts = {
  weather: 15 * 1000,
  yelp: 24 * 1000 * 60 * 60,
  movies: 30 * 1000 * 60 * 60,
  eventbrite: 6 * 1000 * 60 * 60 * 24
}

//Application setup
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());

//Database setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err => console.log(err));

//API routes
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/events', getEvents);
app.get('/movies', getMovies);
app.get('/yelp', getYelp);
app.get('/trails', getTrails);

//Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening to PORT: ${PORT}`));

//Error handler
function handleError(error, response) {
  console.log(error);
  if (response) response.status(500).send('Sorry, somthing went wrong.');
}

//Look for the requested data in the database
function lookup(options) {
  const SQL = `SELECT * FROM ${options.tableName} WHERE location_id=$1;`;
  const values = [options.location];

  client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {options.cacheHit(result);}
      else {options.cacheMiss();}
    })
    .catch(error => handleError(error));
}

//Clear the data for a location if it is stale
function deleteLocationsDataById(table, city) {
  const SQL = `DELETE from ${table} WHERE location_id=${city};`;
  return client.query(SQL);
}

//Constructor functions (Models)

//Location
function Location(query, res) {
  this.tableName = 'locations';
  this.city_query = query;
  this.formatted_query = res.results[0].formatted_address;
  this.latitude = res.results[0].geometry.location.lat;
  this.longitude = res.results[0].geometry.location.lng;
  this.created_at = Date.now();
}

//Weather
function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toDateString();
}

//Events
function Event(place) {
  this.link = place.url;
  this.name = place.name.text;
  this.event_date = new Date(place.start.local).toDateString();
  this.summary = place.summary;
}

// function Movie() {
//   this.title
//   this.overview
//   this.average_votes
//   this.total_votes
//   this.image_url
//   this.popularity
//   this.released_on
// }

//Helper functions
function getLocation(req, res) {
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${req.query.data}&key=${process.env.GEOCODE_API_KEY}`

  let location;

  return superagent.get(geocodeUrl)
    .then (data => {
      location = new Location(req.query.data, JSON.parse(data.text));
      res.send(location);
    })
    .catch (err => {
      res.send(err);
    })
}

function getWeather(req, res) {
  const weatherUrl = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`

  return superagent.get(weatherUrl)
    .then (data => {
      const weatherEntries = data.body.daily.data.map(day => {
        return new Weather(day);
      })
      res.send(weatherEntries);
    })
    .catch (err => {
      res.send(err);
    })
}

function getEvents(req, res) {
  const eventsUrl = `https://www.eventbriteapi.com/v3/events/search?location.longitude=${req.query.data.longitude}&location.latitude=${req.query.data.latitude}&token=${process.env.EVENTS_API_KEY}`

  return superagent.get(eventsUrl)
    .then (data => {
      const eventsNearby = [];
      for (let i = 0; i < 20; i++) {
        eventsNearby.push(new Event(data.body.events[i]));
      }
      res.send(eventsNearby);
    })
    .catch (err => {
      res.send(err);
    })
}


