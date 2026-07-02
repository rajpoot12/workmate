package com.workmemory.ai;

public final class VectorMath {

    private VectorMath() {}

    public static void l2NormalizeInPlace(float[] v) {
        double sum = 0;
        for (float x : v) sum += (double) x * x;
        double norm = Math.sqrt(sum);
        if (norm < 1e-9) return;
        for (int i = 0; i < v.length; i++) v[i] = (float) (v[i] / norm);
    }

    /** Cosine similarity. Assumes inputs are NOT necessarily normalized. */
    public static double cosine(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length) return 0.0;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += (double) a[i] * b[i];
            na += (double) a[i] * a[i];
            nb += (double) b[i] * b[i];
        }
        if (na < 1e-12 || nb < 1e-12) return 0.0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
}
