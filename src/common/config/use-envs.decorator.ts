export const UseEnvs =
  <TProperty>(
    pattern: RegExp,
    transform?: (raw?: string) => TProperty,
  ): PropertyDecorator =>
  (proto, propertyKey) => {
    let computed = null;

    Object.defineProperty(proto, propertyKey, {
      enumerable: true,
      get() {
        if (!computed) {
          computed = (() => {
            const keys = Object.keys(process.env).filter((key) =>
              pattern.test(key),
            );
            const raw = keys.map((key) => process.env[key]);

            if (transform) {
              return raw.map((rawEnv, i) => {
                try {
                  return transform(rawEnv);
                } catch (err) {
                  throw new Error(
                    `Failed to transform config ${keys[i]}: ${err}`,
                  );
                }
              });
            }

            return raw;
          })();
        }

        return computed;
      },
    });
  };
