# QrOrderingClient

In progress vibe-coded client for the QrOrderingSystem API using the backend of www.restaurantsystem.cloud

Currently this alternative client is live on https://ngdemo.restaurantsystem.cloud


Goal: a reference implementation of a client of the 
www.restaurantsystem.cloud api for any independent developer or company.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.6.

## The Developer Keys

To use this project you will need to generate sandbox keys. You can get the developer keys from the www.restaurantsystem.cloud website. The developer keys are used to authenticate with the api.
The environment.template.fs shows a working example of how to use the api. You need to copy this file to environment.ts and insert your access key. The defaultRestaurantId can stey empty.
Note. It is still true that the behavior is limited by the permissions related to the jwt token. Therefore the api key alone does not grant access to all restaurants or all features.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
