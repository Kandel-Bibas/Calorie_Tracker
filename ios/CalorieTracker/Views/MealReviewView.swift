import SwiftUI

struct MealReviewView: View {
    @Binding var mealLabel: String
    @Binding var mealNotes: String
    @Binding var items: [FoodItem]
    
    var onSave: () -> Void
    var onCancel: () -> Void
    var errorMessage: String? = nil
    
    @State private var editingItemIndex: Int? = nil
    @State private var editName: String = ""
    @State private var editGrams: String = ""
    
    var body: some View {
        VStack {
            Form {
                Section("Meal Details") {
                    TextField("Meal Name", text: $mealLabel)
                        .font(.headline)
                    TextField("Notes", text: $mealNotes)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                
                Section("Identified Items") {
                    if items.isEmpty {
                        Text("Identifying ingredients...")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 8)
                    } else {
                        ForEach(items.indices, id: \.self) { index in
                            Button {
                                editName = items[index].displayName
                                editGrams = String(format: "%.0f", items[index].grams)
                                editingItemIndex = index
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text(items[index].displayName)
                                            .fontWeight(.medium)
                                            .foregroundStyle(.primary)
                                        Spacer()
                                        Text("\(Int(items[index].grams))g")
                                            .foregroundStyle(.secondary)
                                    }
                                    
                                    HStack {
                                        let itemKcal = items[index].kcalPer100g * items[index].grams / 100
                                        Text("\(Int(itemKcal)) kcal")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        
                                        Spacer()
                                        
                                        let p = (items[index].proteinPer100g ?? 0) * items[index].grams / 100
                                        let c = (items[index].carbPer100g ?? 0) * items[index].grams / 100
                                        let f = (items[index].fatPer100g ?? 0) * items[index].grams / 100
                                        Text("P: \(Int(p))g  C: \(Int(c))g  F: \(Int(f))g")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .onDelete(perform: deleteItems)
                    }
                }
                
                Section("Totals") {
                    let totalKcal = items.reduce(0.0) { $0 + ($1.kcalPer100g * $1.grams / 100) }
                    let totalProtein = items.reduce(0.0) { $0 + (($1.proteinPer100g ?? 0) * $1.grams / 100) }
                    let totalCarb = items.reduce(0.0) { $0 + (($1.carbPer100g ?? 0) * $1.grams / 100) }
                    let totalFat = items.reduce(0.0) { $0 + (($1.fatPer100g ?? 0) * $1.grams / 100) }
                    
                    HStack {
                        Text("Calories")
                            .fontWeight(.bold)
                        Spacer()
                        Text("\(Int(totalKcal)) kcal")
                            .fontWeight(.bold)
                            .foregroundStyle(.orange)
                    }
                    
                    HStack {
                        Text("Macros")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("P: \(Int(totalProtein))g  C: \(Int(totalCarb))g  F: \(Int(totalFat))g")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            
            if let errorMessage {
                Text(errorMessage)
                    .font(.subheadline)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal)
            }

            HStack(spacing: 16) {
                Button(role: .cancel) {
                    onCancel()
                } label: {
                    Text("Re-record")
                        .fontWeight(.semibold)
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color.orange, lineWidth: 1)
                        )
                }
                
                Button {
                    onSave()
                } label: {
                    Text("Save Log")
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.orange)
                        .cornerRadius(10)
                }
                .disabled(items.isEmpty)
            }
            .padding()
        }
        .sheet(item: Binding<EditIndex?>(
            get: { editingItemIndex.map { EditIndex(index: $0) } },
            set: { editingItemIndex = $0?.index }
        )) { editInfo in
            NavigationStack {
                Form {
                    Section("Edit Food Item") {
                        TextField("Name", text: $editName)
                        TextField("Grams", text: $editGrams)
                            .keyboardType(.numberPad)
                    }
                }
                .navigationTitle("Edit Item")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            editingItemIndex = nil
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            if let gramsVal = Double(editGrams) {
                                items[editInfo.index].displayName = editName
                                items[editInfo.index].grams = gramsVal
                            }
                            editingItemIndex = nil
                        }
                        .disabled(editName.isEmpty || editGrams.isEmpty)
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }
    
    private func deleteItems(at offsets: IndexSet) {
        items.remove(atOffsets: offsets)
    }
}

struct EditIndex: Identifiable {
    let id = UUID()
    let index: Int
}
