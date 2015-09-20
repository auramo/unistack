import React from 'react'
import Bacon from 'baconjs'
import inBrowser from './inBrowser'
import request from 'superagent-bluebird-promise'

/**
 * @return a view that lists the scheduled movies and the input elements for booking tickets on those movies
 */
const showMovies = applicationState =>
    <ul className="movies">
    {
        applicationState.movies.map((movie, key) =>
            <li className="movies__movie" key={key}>
                <div className="movies__movie__image-container">
                    <img src={movie.imageUrl}/>
                </div>
                <div className="movies__movie__details">
                    <h2>{movie.title}</h2>
                    <h3>{movie.startTime}</h3>
                    <input
                        type="number"
                        placeholder="Number of tickets"
                        value={applicationState.bookings[movie.id] || undefined}
                        onChange={evt => amountOfTicketsInput.push({movieId: movie.id, textInput: evt.target.value}) }
                        />
                    <button
                        onClick={() => bookingButtonClickedBus.push()}
                        disabled={!applicationState.bookings[movie.id]}>
                        Book now
                    </button>
                </div>
            </li>
        )
    }
    </ul>

/**
 * @return a view that describes the bookings of the user
 */
const showBookings = applicationState =>
    <div>
        <h2>Your bookings</h2>
        <ul>
        {
            applicationState
                .movies
                .filter(({id}) => Object.keys(applicationState.bookings).indexOf(id) > -1)
                .map((bookedMovie, key) =>
                    <li key={key}>
                        <h3>{bookedMovie.title}, {bookedMovie.startTime}</h3>
                        <div>{applicationState.bookings[bookedMovie.id]} tickets</div>
                    </li>
                )
        }
        </ul>
    </div>

export const renderPage = applicationState =>
    <body>
        <h1 className="page-title">{pageTitle}</h1>
        {(() => { // Select the view based on the current url
            switch (true) {
                case frontPagePath.test(applicationState.currentUrl):
                    return showMovies(applicationState)
                case userBookingsPath.test(applicationState.currentUrl):
                    return showBookings(applicationState)
                default:
                    return `Could not find a route for ${applicationState.currentUrl}`
            }
        })()}
    </body>

const userBookingsPath = new RegExp('^/user/(.*)/bookings')
const frontPagePath = new RegExp('^/$')

/**
 * These regular expressions define the HTTP URLs that our ticket booking application supports
 */
export const pagePaths = [frontPagePath, userBookingsPath]

export const findUserId = url => {
    const userIdFromUrl = url.match(userBookingsPath)
    return userIdFromUrl ? userIdFromUrl[1] : undefined
}

export const initialState = (movies, initialUrl, initialBookings) => ({
    movies, // Our application contains movies [type: List[Map]]
    currentUrl: initialUrl, // .. and the current URL [type: String]
    bookings: initialBookings // .. and the bookings of the user [type: Map[String, Map]]
})

export const pageTitle = 'Book movie tickets'

const userId = () => {
    const localStorageKey = 'bookingAppUserId'
    const storedUserId = localStorage.getItem(localStorageKey)
    if (storedUserId) { // Get the existing user id from local storage
        return storedUserId
    } else { // Generate a new user id and persist it into the local storage
        const generatedUserId = Math.random().toString()
        localStorage.setItem(localStorageKey, generatedUserId)
        return generatedUserId
    }
}

const bookingButtonClickedBus = new Bacon.Bus()

/**
 * The currentUrlStream emits an event every time the URL of our app changes.
 */
const currentUrlStream = Bacon.mergeAll(
    bookingButtonClickedBus // When the user presses the booking button, our current URL changes
        .map(() => `/user/${userId()}/bookings`)
        .doAction(url => history.pushState({}, '', url)),
    inBrowser ?
        Bacon // Also when the user navigates back or forward in the browser, our current URL changes
            .fromBinder(sink => { window.onpopstate = sink })
            .map(() => document.location.pathname)
        :
        Bacon.never()
)

const amountOfTicketsInput = new Bacon.Bus()
const bookingsStream = amountOfTicketsInput
    .filter(({textInput}) => /\d+/.test(textInput) || textInput === "") // Accept only integers or an empty string as the amount-of-tickets input
    .map(({movieId, textInput}) => ({
        movieId, amountOfTickets: textInput.length == 0 ? 0 : parseInt(textInput) // Map the textual presentation of the amount-of-tickets into an integer
    }))
    .flatMap(({movieId, amountOfTickets}) =>
        Bacon
            .fromPromise(request.put( // Send the booking info to the server
                `/api/users/${userId()}/bookings/${movieId}?amountOfTickets=${amountOfTickets}`
            ))
            .map(({movieId, amountOfTickets})) // If the server accepts the booking, emit movieId and amountOfTickets from the bookingsStream
    )

export const applicationStateProperty = initialState => Bacon.update(
    initialState,
    bookingsStream, (applicationState, {movieId, amountOfTickets}) => {
        const previousBookings = applicationState.bookings
        const newBooking = {...previousBookings, [movieId]: amountOfTickets}
        return { ...applicationState, bookings: newBooking} // Add the new booking into the application state
    },
    currentUrlStream, (applicationState, currentUrl) => (
        {...applicationState, currentUrl} // Add the changed url into the application state
    )
).doLog('application state')
