import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
	messageResponseSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { routeConfigService } from '@/services';
import type { RuleSet } from '@/types/singbox';
import { NotFoundError } from '@/utils/errors';
import type { RouterType } from '../types';

export function registerRuleSetRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/route/rule-sets',
			description: 'List all rule sets',
			tags: ['Config', 'Route', 'RuleSets'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							ruleSets: Type.Array(genericObjectSchema),
							total: Type.Number(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const ruleSets = await routeConfigService.getRuleSets();
					return FetsResponse.json({
						success: true,
						data: {
							ruleSets,
							total: ruleSets.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/route/rule-sets/:tag',
			description: 'Get rule set by tag',
			tags: ['Config', 'Route', 'RuleSets'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { tag } = request.params;
					const ruleSet = await routeConfigService.getRuleSet(tag);
					if (!ruleSet) {
						return FetsResponse.json(
							{ success: false as const, error: `Rule set '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: ruleSet,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/route/rule-sets',
			description: 'Create a new rule set',
			tags: ['Config', 'Route', 'RuleSets'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object(
						{
							type: Type.Union([Type.Literal('local'), Type.Literal('remote')]),
							tag: Type.String(),
							format: Type.Union([Type.Literal('source'), Type.Literal('binary')]),
						},
						{ additionalProperties: true },
					),
				},
				responses: {
					201: apiResponseSchema(genericObjectSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = (await request.json()) as RuleSet;
					const ruleSet = await routeConfigService.createRuleSet(body);
					return FetsResponse.json(
						{
							success: true,
							data: ruleSet,
						},
						{ status: 201 },
					);
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/route/rule-sets/:tag',
			description: 'Replace a rule set',
			tags: ['Config', 'Route', 'RuleSets'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
					json: Type.Object(
						{
							type: Type.Union([Type.Literal('local'), Type.Literal('remote')]),
							tag: Type.String(),
							format: Type.Union([Type.Literal('source'), Type.Literal('binary')]),
						},
						{ additionalProperties: true },
					),
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { tag } = request.params;
					const body = (await request.json()) as RuleSet;
					const ruleSet = await routeConfigService.updateRuleSet(tag, body);
					return FetsResponse.json({
						success: true,
						data: ruleSet,
					});
				} catch (error) {
					if (error instanceof NotFoundError) {
						return FetsResponse.json(
							{ success: false as const, error: error.message, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return handleError(error);
				}
			},
		})
		.route({
			method: 'DELETE',
			path: '/config/route/rule-sets/:tag',
			description: 'Delete a rule set',
			tags: ['Config', 'Route', 'RuleSets'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
				},
				responses: {
					200: apiResponseSchema(messageResponseSchema),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { tag } = request.params;
					const deleted = await routeConfigService.deleteRuleSet(tag);
					if (!deleted) {
						return FetsResponse.json(
							{ success: false as const, error: `Rule set '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: { message: `Rule set '${tag}' deleted` },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
