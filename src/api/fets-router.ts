import { createRouter } from 'fets';
import {
	registerBackupRoutes,
	registerCertificateRoutes,
	registerConfigCoreRoutes,
	registerDiffRoutes,
	registerDnsRoutes,
	registerEndpointRoutes,
	registerExperimentalRoutes,
	registerExportImportRoutes,
	registerHealthRoutes,
	registerInboundRoutes,
	registerLogRoutes,
	registerNtpRoutes,
	registerOutboundRoutes,
	registerRouteRoutes,
	registerRuleSetRoutes,
	registerServerRoutes,
	registerServiceRoutes,
	registerSingboxRoutes,
} from './routes';

const baseRouter = createRouter({
	landingPage: false,
	openAPI: {
		info: {
			title: 'sing-box-orbit-node API',
			description: 'REST API for managing sing-box server',
			version: '0.0.1',
		},
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
				},
				apiKeyHeader: {
					type: 'apiKey',
					in: 'header',
					name: 'X-API-Key',
				},
			},
		},
	},
});

export const fetsRouter = registerExportImportRoutes(
	registerCertificateRoutes(
		registerServiceRoutes(
			registerEndpointRoutes(
				registerExperimentalRoutes(
					registerNtpRoutes(
						registerLogRoutes(
							registerDnsRoutes(
								registerRuleSetRoutes(
									registerRouteRoutes(
										registerOutboundRoutes(
											registerInboundRoutes(
												registerBackupRoutes(
													registerConfigCoreRoutes(
														registerDiffRoutes(
															registerSingboxRoutes(
																registerServerRoutes(registerHealthRoutes(baseRouter)),
															),
														),
													),
												),
											),
										),
									),
								),
							),
						),
					),
				),
			),
		),
	),
);
