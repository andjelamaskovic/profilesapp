import { Button, Flex, Grid, TextField, Heading } from "@aws-amplify/ui-react";

// lokalni stil (isti kao prije)
const cardRow = {
    color: "black",
    background: "#fff",
    border: "1px solid #e6e6e6",
    padding: "0.75rem 1rem",
    borderRadius: 12,
};

export default function CategoriesPanel({
                                            newCategory, setNewCategory, editingCategoryId,
                                            onSubmitCategory, cancelEditCategory, categories,
                                            startEditCategory, deleteCategory
                                        }) {
    return (
        <>
            <form onSubmit={onSubmitCategory} style={{ width:"100%", margin:"1rem 0 2rem" }}>
                <Flex gap="1rem" direction="column">
                    <TextField label={`Naziv*${editingCategoryId ? " (editing)" : ""}`} value={newCategory.name}
                               onChange={(e)=>setNewCategory({ ...newCategory, name:e.target.value })} required/>
                    <TextField label="Boja" value={newCategory.color}
                               onChange={(e)=>setNewCategory({ ...newCategory, color:e.target.value })}/>
                    <TextField label="Ikonica (npr. 🍔)" value={newCategory.icon}
                               onChange={(e)=>setNewCategory({ ...newCategory, icon:e.target.value })}/>
                    <Flex gap="0.5rem">
                        <Button type="submit">{editingCategoryId ? "Sačuvaj" : "Dodaj novu kategoriju"}</Button>
                        {editingCategoryId && <Button type="button" variation="link" onClick={cancelEditCategory}>Otkaži</Button>}
                    </Flex>
                </Flex>
            </form>

            <Grid margin="0 0 2rem" autoFlow="row" justifyContent="center" gap="1rem" alignContent="center" width="100%">
                {categories.map(c => (
                    <Flex key={c.id} direction="row" alignItems="center" justifyContent="space-between" gap="0.5rem"
                          style={cardRow} width="100%">
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:20 }}>{c.icon || "🏷️"}</span>
                            <b>{c.name}</b>
                            {c.color ? (
                                <span
                                    style={{
                                        width: 12, height: 12, borderRadius: 6,
                                        background: c.color, display: "inline-block", marginLeft: 8,
                                    }}
                                />
                            ) : null}
                        </div>
                        <Flex gap="0.5rem">
                            <Button size="small" onClick={()=>startEditCategory(c)}>Izmijeni</Button>
                            <Button size="small" variation="destructive" onClick={()=>deleteCategory(c.id)}>Izbriši</Button>
                        </Flex>
                    </Flex>
                ))}
            </Grid>
        </>
    );
}
