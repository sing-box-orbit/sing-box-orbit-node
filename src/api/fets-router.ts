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

const routeRegistrars = [
	registerHealthRoutes,
	registerServerRoutes,
	registerSingboxRoutes,
	registerDiffRoutes,
	registerConfigCoreRoutes,
	registerBackupRoutes,
	registerInboundRoutes,
	registerOutboundRoutes,
	registerRouteRoutes,
	registerRuleSetRoutes,
	registerDnsRoutes,
	registerLogRoutes,
	registerNtpRoutes,
	registerExperimentalRoutes,
	registerEndpointRoutes,
	registerServiceRoutes,
	registerCertificateRoutes,
	registerExportImportRoutes,
];

export const fetsRouter = routeRegistrars.reduce(
	(router, register) => register(router),
	baseRouter as ReturnType<typeof createRouter>,
);
