/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  ValidationTypes,
  ValidationResponse,
  Validator,
} from "../constants/WidgetValidation";
import { isObject, isPlainObject, isString, rest, toString } from "lodash";

import moment from "moment";
import { ValidationConfig } from "constants/PropertyControlConstants";
import unescapeJS from "unescape-js";
import { getFnContents } from "./ast";

function validatePlainObject(
  config: ValidationConfig,
  value: Record<string, unknown>,
  props: Record<string, unknown>,
) {
  if (config.params?.allowedKeys) {
    let _valid = true;
    const _messages: string[] = [];
    config.params.allowedKeys.forEach((entry) => {
      if (value.hasOwnProperty(entry.name)) {
        const { isValid, message } = validate(entry, value[entry.name], props);
        if (!isValid) {
          _valid = isValid;
          message &&
            _messages.push(
              `Value of key: ${entry.name} is invalid: ${message}`,
            );
        }
      } else if (entry.params?.required) {
        return {
          isValid: false,
          parsed: value,
          message: `Missing required key: ${entry.name}`,
        };
      }
    });
    if (_valid) {
      return {
        isValid: true,
        parsed: value,
      };
    }
    return {
      isValid: false,
      parsed: config.params?.default || value,
      message: _messages.join(" "),
    };
  }
  return {
    isValid: true,
    parsed: value,
  };
}

function validateArray(
  config: ValidationConfig,
  value: unknown[],
  props: Record<string, unknown>,
) {
  const whiteList = config.params?.allowedValues;
  if (whiteList) {
    value.forEach((entry) => {
      if (!whiteList.includes(entry)) {
        return {
          isValid: false,
          parsed: value,
          message: `Disallowed value: ${entry}`,
        };
      }
    });
  }
  const children = config.params?.children;
  let _isValid = true;
  const _messages: string[] = [];
  if (children) {
    value.forEach((entry, index) => {
      const validation = validate(children, entry, props);
      if (!validation.isValid) {
        _isValid = false;
        _messages.push(
          `Invalid entry at index: ${index}. ${validation.message}`,
        );
      }
    });
  }
  return { isValid: _isValid, parsed: value, message: _messages.join(" ") };
}

export const validate = (
  config: ValidationConfig,
  value: unknown,
  props: Record<string, unknown>,
) => {
  return VALIDATORS[config.type as ValidationTypes](config, value, props);
};

const WIDGET_TYPE_VALIDATION_ERROR = "This value does not evaluate to type"; // TODO: Lot's of changes in validations.ts file

export const VALIDATORS: Record<ValidationTypes, Validator> = {
  // TODO(abhinav): write rigorous tests for these
  [ValidationTypes.TEXT]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    if (value === undefined || value === null) {
      if (config.params && config.params.required) {
        return {
          isValid: false,
          parsed: config.params?.default || "",
          message: `${WIDGET_TYPE_VALIDATION_ERROR} "string"`,
        };
      }
      return {
        isValid: true,
        parsed: config.params?.default || "",
      };
    }
    if (isObject(value)) {
      return {
        isValid: false,
        parsed: JSON.stringify(value, null, 2),
        message: `${WIDGET_TYPE_VALIDATION_ERROR} "string"`,
      };
    }
    const isValid = isString(value);
    if (!isValid) {
      try {
        const result = {
          parsed: toString(value),
          isValid: true,
        };
        return result;
      } catch (e) {
        console.error(`Error when parsing ${value} to string`);
        console.error(e);
        return {
          isValid: false,
          parsed: config.params?.default || "",
          message: `${WIDGET_TYPE_VALIDATION_ERROR} "string"`,
        };
      }
    } else {
      return {
        isValid,
        parsed: value,
      };
    }
  },
  // TODO(abhinav): The original validation does not make sense fix this.
  [ValidationTypes.REGEX]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    const { isValid, message, parsed } = VALIDATORS[ValidationTypes.TEXT](
      config,
      value,
      props,
    );

    if (isValid) {
      return {
        isValid: false,
        parsed: new RegExp(parsed),
        message: `${WIDGET_TYPE_VALIDATION_ERROR} "regex"`,
      };
    }

    return { isValid, parsed, message };
  },
  // TODO(ABHINAV): WRITE RIGOROUS TESTS FOR THIS
  [ValidationTypes.NUMBER]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    if (!Number.isFinite(value) && !isString(value)) {
      return {
        isValid: false,
        parsed: config.params?.default || 0,
        message: `${WIDGET_TYPE_VALIDATION_ERROR} "number"`,
      };
    }

    // check for min and max limits
    let parsed: number = value as number;
    if (isString(value)) {
      if (/^\d+\.?\d*$/.test(value)) {
        parsed = Number(value);
      } else {
        return {
          isValid: false,
          parsed: config.params?.default || 0,
          message: `${WIDGET_TYPE_VALIDATION_ERROR} "number"`,
        };
      }
    }

    if (
      config.params?.min !== undefined &&
      Number.isFinite(config.params.min)
    ) {
      if (parsed < Number(config.params.min)) {
        return {
          isValid: false,
          parsed,
          message: `Minimum allowed value: ${config.params.min} `,
        };
      }
    }

    if (
      config.params?.max !== undefined &&
      Number.isFinite(config.params.max)
    ) {
      if (parsed > Number(config.params.max)) {
        return {
          isValid: false,
          parsed,
          message: `Maximum allowed value: ${config.params.max} `,
        };
      }
    }

    return {
      isValid: true,
      parsed,
    };
  },
  // TODO(abhinav): Add rigorous tests for the following
  [ValidationTypes.BOOLEAN]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    if (value === undefined || value === null) {
      if (config.params && config.params.required) {
        return {
          isValid: false,
          parsed: config.params?.default || false,
          message: `${WIDGET_TYPE_VALIDATION_ERROR} "boolean"`,
        };
      }
      return { isValid: true, parsed: config.params?.default || value };
    }
    const isABoolean = value === true || value === false;
    const isStringTrueFalse = value === "true" || value === "false";
    const isValid = isABoolean || isStringTrueFalse;

    let parsed = value;
    if (isStringTrueFalse) parsed = value !== "false";

    if (!isValid) {
      return {
        isValid: false,
        parsed: config.params?.default || parsed,
        message: `${WIDGET_TYPE_VALIDATION_ERROR} "boolean"`,
      };
    }

    return { isValid, parsed };
  },
  // TODO(abhinav): Add rigorous tests for the following
  [ValidationTypes.OBJECT]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    if (
      value === undefined ||
      value === null ||
      (isString(value) && value.trim().length === 0)
    ) {
      if (config.params && config.params.required) {
        return {
          isValid: false,
          parsed: config.params?.default || {},
          message: `${WIDGET_TYPE_VALIDATION_ERROR}: Object`,
        };
      }
      return {
        isValid: true,
        parsed: config.params?.default || value,
      };
    }

    if (isPlainObject(value)) {
      return validatePlainObject(
        config,
        value as Record<string, unknown>,
        props,
      );
    }

    try {
      const result = { parsed: JSON.parse(value as string), isValid: true };
      if (isPlainObject(result.parsed)) {
        return validatePlainObject(config, result.parsed, props);
      }
      return {
        isValid: false,
        parsed: config.params?.default || {},
        message: `${WIDGET_TYPE_VALIDATION_ERROR}: Object`,
      };
    } catch (e) {
      console.error(`Error when parsing ${value} to object`);
      console.error(e);
      return {
        isValid: false,
        parsed: config.params?.default || {},
        message: `${WIDGET_TYPE_VALIDATION_ERROR}: Object`,
      };
    }
  },
  [ValidationTypes.ARRAY]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    const invalidResponse = {
      isValid: false,
      parsed: config.params?.default || [],
      message: `${WIDGET_TYPE_VALIDATION_ERROR} Array`,
    };
    if (value === undefined || value === null) {
      if (config.params && config.params.required) {
        invalidResponse.message =
          "This property is required for the widget to function correctly";
        return invalidResponse;
      }
      return {
        isValid: true,
        parsed: value,
      };
    }

    if (isString(value)) {
      try {
        const _value = JSON.parse(value);
        if (Array.isArray(_value)) {
          const result = validateArray(config, _value, props);
          return result;
        }
      } catch (e) {
        console.log("Error when validating: ", { e });
        return invalidResponse;
      }
    }

    if (Array.isArray(value)) {
      return validateArray(config, value, props);
    }

    return invalidResponse;
  },
  [ValidationTypes.OBJECT_ARRAY]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    const invalidResponse = {
      isValid: false,
      parsed: config.params?.default || [{}],
      message: `${WIDGET_TYPE_VALIDATION_ERROR} Array of objects`,
    };
    if (
      value === undefined ||
      value === null ||
      (!isString(value) && !Array.isArray(value))
    ) {
      return invalidResponse;
    }

    let parsed = value;

    if (isString(value)) {
      try {
        parsed = JSON.parse(value);
      } catch (e) {
        return invalidResponse;
      }
    }

    if (Array.isArray(parsed)) {
      parsed.forEach((entry, index) => {
        if (!isPlainObject(entry)) {
          return {
            ...invalidResponse,
            message: `Invalid object at index ${index}`,
          };
        }
      });
      return { isValid: true, parsed };
    }
    return invalidResponse;
  },
  [ValidationTypes.DATE_ISO_STRING]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    const invalidResponse = {
      isValid: false,
      parsed: config.params?.default || moment().toISOString(true),
      message: `${WIDGET_TYPE_VALIDATION_ERROR}: Full ISO 8601 date string`,
    };
    if (
      value === undefined ||
      value === null ||
      !isString(value) ||
      (isString(value) && !moment(value).isValid())
    ) {
      return invalidResponse;
    }
    if (isString(value) && moment(value).isValid()) {
      if (
        value === moment(value).toISOString() ||
        value === moment(value).toISOString(true)
      ) {
        return {
          isValid: true,
          parsed: value,
        };
      } else {
        return {
          isValid: true,
          parsed: moment(value).toISOString(), // attempting to parse.
        };
      }
    }
    return invalidResponse;
  },
  [ValidationTypes.FUNCTION]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    const invalidResponse = {
      isValid: false,
      parsed: undefined,
      message: "Failed to validate",
    };
    if (config.params?.fnString && isString(config.params?.fnString)) {
      const fnContents = getFnContents(config.params.fnString);
      try {
        const fn = Function("value", "props", fnContents);
        return fn(value, props);
      } catch (e) {
        console.log("Validation function error: --", { e });
      }
    }
    return invalidResponse;
  },
  [ValidationTypes.IMAGE_URL]: (
    config: ValidationConfig,
    value: unknown,
    props: Record<string, unknown>,
  ): ValidationResponse => {
    const invalidResponse = {
      isValid: false,
      parsed: config.params?.default || "",
      message: `${WIDGET_TYPE_VALIDATION_ERROR}: base64 string or data uri or URL`,
    };
    const base64ImageRegex = /^data:image\/.*;base64/;
    const imageUrlRegex = /(http(s?):)([/|.|\w|\s|-])*\.(?:jpeg|jpg|gif|png)??(?:&?[^=&]*=[^=&]*)*/;
    if (
      value === undefined ||
      value === null ||
      (isString(value) && value.trim().length === 0)
    ) {
      if (config.params && config.params.required) return invalidResponse;
      return { isValid: true, parsed: value };
    }
    if (isString(value)) {
      if (imageUrlRegex.test(value.trim())) {
        return { isValid: true, parsed: value.trim() };
      }
      if (base64ImageRegex.test(value)) {
        let parsed: string = value;
        try {
          if (btoa(atob(value)) === value) {
            parsed = "data:image/png;base64," + value;
          }
          return {
            isValid: true,
            parsed,
          };
        } catch (e) {
          return invalidResponse;
        }
      }
    }
    return invalidResponse;
  },
};
