import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ERROR_REPORTER, SentryErrorReporter } from "./error-reporter";
import { ReportErrorsFilter } from "./report-errors.filter";

@Module({
  providers: [
    { provide: ERROR_REPORTER, useClass: SentryErrorReporter },
    { provide: APP_FILTER, useClass: ReportErrorsFilter },
  ],
})
export class ObservabilityModule {}
